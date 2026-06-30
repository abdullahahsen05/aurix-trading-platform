if (typeof window !== "undefined") {
  throw new Error("[aurix] backgroundJobService is server-only.");
}

import { createAdminClient } from "@/lib/supabase/admin";
import type { BackgroundJob, JobResult, JobStatus, JobType } from "@/lib/jobs/types";

// ─────────────────────────────────────────────────────────────────────────────
// Background Job Service (server-only). Enqueue, atomically claim, and finalize
// jobs. Payloads contain IDs only — never secrets, tokens, or credentials.
// ─────────────────────────────────────────────────────────────────────────────

const SELECT_COLS =
  "id, type, status, priority, run_after, attempts, max_attempts, unique_key, locked_at, locked_by, started_at, completed_at, failed_at, last_error_code, last_error_message, payload, result, created_by, created_at, updated_at";

/** Backoff for the Nth failed attempt: 1→1m, 2→5m, 3+→15m. Pure + tested. */
export function backoffMs(attempt: number): number {
  const schedule = [60_000, 300_000, 900_000];
  const idx = Math.min(Math.max(attempt, 1), schedule.length) - 1;
  return schedule[idx];
}

interface Row {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  run_after: string;
  attempts: number;
  max_attempts: number;
  unique_key: string | null;
  locked_at: string | null;
  locked_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapJob(r: Row): BackgroundJob {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    priority: r.priority,
    runAfter: r.run_after,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    uniqueKey: r.unique_key,
    lockedAt: r.locked_at,
    lockedBy: r.locked_by,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    failedAt: r.failed_at,
    lastErrorCode: r.last_error_code,
    lastErrorMessage: r.last_error_message,
    payload: r.payload ?? {},
    result: r.result,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface EnqueueParams {
  type: JobType;
  payload?: Record<string, unknown>;
  priority?: number;
  runAfter?: string;
  maxAttempts?: number;
  createdBy?: string | null;
  /** When set, an existing PENDING/RUNNING job with the same key is reused instead of duplicated. */
  uniqueKey?: string;
}

export async function enqueueJob(params: EnqueueParams): Promise<BackgroundJob> {
  const supabase = createAdminClient();
  const insert = {
    type: params.type,
    payload: params.payload ?? {},
    priority: params.priority ?? 100,
    run_after: params.runAfter ?? new Date().toISOString(),
    max_attempts: params.maxAttempts ?? 3,
    created_by: params.createdBy ?? null,
    unique_key: params.uniqueKey ?? null,
  };

  const { data, error } = await supabase.from("background_jobs").insert(insert).select(SELECT_COLS).single();

  if (error) {
    // 23505 on the partial unique index = an active job with this key already
    // exists — reuse it rather than duplicating work.
    if ((error as { code?: string }).code === "23505" && params.uniqueKey) {
      const { data: existing } = await supabase
        .from("background_jobs")
        .select(SELECT_COLS)
        .eq("unique_key", params.uniqueKey)
        .in("status", ["PENDING", "RUNNING"])
        .limit(1)
        .maybeSingle();
      if (existing) return mapJob(existing as Row);
    }
    throw new Error(`Failed to enqueue job: ${error.message}`);
  }
  return mapJob(data as Row);
}

/** Atomically claim up to `limit` runnable jobs (FOR UPDATE SKIP LOCKED via RPC). */
export async function claimNextJobs(params: {
  workerId: string;
  limit: number;
  types?: JobType[];
}): Promise<BackgroundJob[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_background_jobs", {
    p_worker: params.workerId,
    p_limit: Math.min(Math.max(params.limit, 0), 20),
    p_types: params.types ?? null,
  });
  if (error) throw new Error(`Failed to claim jobs: ${error.message}`);
  return ((data ?? []) as Row[]).map(mapJob);
}

async function update(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("background_jobs").update(patch).eq("id", jobId);
  if (error) throw new Error(`Failed to update job: ${error.message}`);
}

/**
 * Finalize a claimed job from its processor result. FAILED jobs reschedule with
 * backoff while attempts remain (unless retry === false); otherwise terminal.
 */
export async function finalizeJob(job: BackgroundJob, result: JobResult): Promise<void> {
  const now = new Date().toISOString();

  if (result.status === "SUCCESS") {
    await update(job.id, {
      status: "SUCCESS",
      completed_at: now,
      result: result.result ?? null,
      locked_at: null,
      locked_by: null,
      last_error_code: null,
      last_error_message: null,
    });
    return;
  }

  if (result.status === "SKIPPED") {
    await update(job.id, {
      status: "SKIPPED",
      completed_at: now,
      result: result.result ?? null,
      locked_at: null,
      locked_by: null,
      last_error_code: result.errorCode ?? null,
      last_error_message: result.errorMessage ?? null,
    });
    return;
  }

  // FAILED
  const canRetry = result.retry !== false && job.attempts < job.maxAttempts;
  if (canRetry) {
    await update(job.id, {
      status: "PENDING",
      run_after: new Date(Date.now() + backoffMs(job.attempts)).toISOString(),
      locked_at: null,
      locked_by: null,
      last_error_code: result.errorCode ?? null,
      last_error_message: result.errorMessage ?? null,
    });
  } else {
    await update(job.id, {
      status: "FAILED",
      failed_at: now,
      locked_at: null,
      locked_by: null,
      last_error_code: result.errorCode ?? null,
      last_error_message: result.errorMessage ?? null,
    });
  }
}

/** Release jobs stuck in RUNNING past the stale threshold back to PENDING (or FAILED if exhausted). */
export async function releaseStaleJobs(staleMinutes: number): Promise<number> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data: stale } = await supabase
    .from("background_jobs")
    .select("id, attempts, max_attempts")
    .eq("status", "RUNNING")
    .lt("locked_at", cutoff)
    .limit(100);

  let released = 0;
  for (const j of (stale ?? []) as { id: string; attempts: number; max_attempts: number }[]) {
    const terminal = j.attempts >= j.max_attempts;
    await update(j.id, terminal
      ? { status: "FAILED", failed_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error_code: "STALE_TIMEOUT", last_error_message: "Job exceeded the stale-running timeout." }
      : { status: "PENDING", run_after: new Date().toISOString(), locked_at: null, locked_by: null, last_error_code: "STALE_TIMEOUT", last_error_message: "Released after stale-running timeout." });
    released++;
  }
  return released;
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("background_jobs")
    .update({ status: "CANCELLED", completed_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "PENDING") // only pending jobs can be cancelled
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Failed to cancel job: ${error.message}`);
  return Boolean(data);
}

/** Re-queue a terminal job for a fresh run (resets attempts). */
export async function requeueJob(jobId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("background_jobs")
    .update({
      status: "PENDING",
      attempts: 0,
      run_after: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      failed_at: null,
      completed_at: null,
    })
    .eq("id", jobId)
    .in("status", ["FAILED", "CANCELLED", "SKIPPED"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Failed to requeue job: ${error.message}`);
  return Boolean(data);
}

export async function listJobs(filters?: {
  status?: JobStatus;
  type?: JobType;
  limit?: number;
}): Promise<BackgroundJob[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("background_jobs")
    .select(SELECT_COLS)
    .order("created_at", { ascending: false })
    .limit(Math.min(filters?.limit ?? 100, 200));
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.type) query = query.eq("type", filters.type);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list jobs: ${error.message}`);
  return ((data ?? []) as Row[]).map(mapJob);
}

export async function getJob(jobId: string): Promise<BackgroundJob | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("background_jobs").select(SELECT_COLS).eq("id", jobId).maybeSingle();
  return data ? mapJob(data as Row) : null;
}

export interface JobStats {
  pending: number;
  running: number;
  successToday: number;
  failedToday: number;
  skippedToday: number;
}

export async function getJobStats(): Promise<JobStats> {
  const supabase = createAdminClient();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const since = dayStart.toISOString();
  const head = () => supabase.from("background_jobs").select("id", { count: "exact", head: true });

  const [pending, running, successToday, failedToday, skippedToday] = await Promise.all([
    head().eq("status", "PENDING"),
    head().eq("status", "RUNNING"),
    head().eq("status", "SUCCESS").gte("completed_at", since),
    head().eq("status", "FAILED").gte("failed_at", since),
    head().eq("status", "SKIPPED").gte("completed_at", since),
  ]);

  return {
    pending: pending.count ?? 0,
    running: running.count ?? 0,
    successToday: successToday.count ?? 0,
    failedToday: failedToday.count ?? 0,
    skippedToday: skippedToday.count ?? 0,
  };
}
