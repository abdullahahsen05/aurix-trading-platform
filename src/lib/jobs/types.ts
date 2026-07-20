// ─────────────────────────────────────────────────────────────────────────────
// Background job queue — shared types (safe to import anywhere; no secrets).
// ─────────────────────────────────────────────────────────────────────────────

export type JobType =
  | "SYNC_ACCOUNT"
  | "SYNC_ALL_CONNECTED_ACCOUNTS"
  | "MONITOR_COPY_STRATEGY"
  | "MONITOR_ALL_ACTIVE_COPY_STRATEGIES"
  | "SIMULATE_COPY_EVENT"
  | "SIMULATE_COPY_STRATEGY"
  | "EXECUTE_COPY_EVENT"
  | "CLOSE_COPY_STRATEGY"
  | "RETRY_COPY_LOG"
  | "CLEANUP_STALE_JOBS"
  | "SYNC_EVALUATION_ACCOUNT"
  | "CHECK_EVALUATION_ATTEMPT"
  | "CHECK_ALL_ACTIVE_EVALUATIONS";

export type JobStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED" | "SKIPPED";

export interface BackgroundJob {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  runAfter: string;
  attempts: number;
  maxAttempts: number;
  uniqueKey: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Outcome a processor returns for one job. */
export interface JobResult {
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  result?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  /** For FAILED only: whether a retry is allowed (default true). Gate/validation failures set false. */
  retry?: boolean;
}
