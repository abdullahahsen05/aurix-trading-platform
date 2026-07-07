if (typeof window !== "undefined") {
  throw new Error("[aurix] evaluationService is server-only.");
}

import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/auditService";
import { createNotification } from "@/lib/services/notificationService";
import {
  evaluateAttempt,
  calculateAcademyCompletion,
  type CheckResult,
} from "@/lib/services/evaluationRulesEngine";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface EvaluationProgramDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  requiredCourseId: string | null;
  requiredCourseName: string | null;
  startingBalance: number;
  profitTargetPercent: number;
  maxDailyDrawdownPercent: number;
  maxOverallDrawdownPercent: number;
  minimumTradingDays: number;
  durationDays: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  rules: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationAttemptDto {
  id: string;
  programId: string;
  programName: string;
  programSlug: string;
  userId: string;
  tradingAccountId: string | null;
  tradingAccountName: string | null;
  status: string;
  startingBalance: number | null;
  startedAt: string | null;
  endsAt: string | null;
  passedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  passReason: string | null;
  failReason: string | null;
  latestMetrics: Record<string, unknown>;
  lastCheckedAt: string | null;
  adminOverrideBy: string | null;
  adminOverrideReason: string | null;
  createdAt: string;
}

export interface ProgramWithStatusDto extends EvaluationProgramDto {
  attemptStatus: string | null;
  attemptId: string | null;
  isUnlocked: boolean;
  academyProgressPercent: number | null;
}

export interface CreateProgramInput {
  slug: string;
  name: string;
  description?: string;
  requiredCourseId?: string;
  startingBalance: number;
  profitTargetPercent: number;
  maxDailyDrawdownPercent: number;
  maxOverallDrawdownPercent: number;
  minimumTradingDays: number;
  durationDays: number;
}

export interface UpdateProgramInput {
  name?: string;
  description?: string;
  requiredCourseId?: string | null;
  startingBalance?: number;
  profitTargetPercent?: number;
  maxDailyDrawdownPercent?: number;
  maxOverallDrawdownPercent?: number;
  minimumTradingDays?: number;
  durationDays?: number;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

export interface OverrideAttemptInput {
  newStatus: "PASSED" | "FAILED" | "CANCELLED";
  reason: string;
  adminUserId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin — Programs
// ─────────────────────────────────────────────────────────────────────────────

export async function adminListEvaluationPrograms(): Promise<EvaluationProgramDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("evaluation_programs")
    .select("*, academy_courses(title)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapProgram);
}

export async function adminCreateEvaluationProgram(
  input: CreateProgramInput,
  actorUserId: string
): Promise<EvaluationProgramDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("evaluation_programs")
    .insert({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      required_course_id: input.requiredCourseId ?? null,
      starting_balance: input.startingBalance,
      profit_target_percent: input.profitTargetPercent,
      max_daily_drawdown_percent: input.maxDailyDrawdownPercent,
      max_overall_drawdown_percent: input.maxOverallDrawdownPercent,
      minimum_trading_days: input.minimumTradingDays,
      duration_days: input.durationDays,
      created_by: actorUserId,
    })
    .select("*, academy_courses(title)")
    .single();
  if (error) throw new Error(error.message);
  await writeAuditLog({
    actorUserId,
    action: "EVAL_PROGRAM_CREATED",
    entityType: "evaluation_program",
    entityId: (data as Record<string, unknown>).id as string,
    metadata: { slug: input.slug, name: input.name },
  });
  return mapProgram(data as Record<string, unknown>);
}

export async function adminUpdateEvaluationProgram(
  programId: string,
  input: UpdateProgramInput,
  actorUserId: string
): Promise<EvaluationProgramDto> {
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if ("requiredCourseId" in input) patch.required_course_id = input.requiredCourseId ?? null;
  if (input.startingBalance !== undefined) patch.starting_balance = input.startingBalance;
  if (input.profitTargetPercent !== undefined) patch.profit_target_percent = input.profitTargetPercent;
  if (input.maxDailyDrawdownPercent !== undefined) patch.max_daily_drawdown_percent = input.maxDailyDrawdownPercent;
  if (input.maxOverallDrawdownPercent !== undefined) patch.max_overall_drawdown_percent = input.maxOverallDrawdownPercent;
  if (input.minimumTradingDays !== undefined) patch.minimum_trading_days = input.minimumTradingDays;
  if (input.durationDays !== undefined) patch.duration_days = input.durationDays;
  if (input.status !== undefined) patch.status = input.status;

  const { data, error } = await supabase
    .from("evaluation_programs")
    .update(patch)
    .eq("id", programId)
    .select("*, academy_courses(title)")
    .single();
  if (error) throw new Error(error.message);
  await writeAuditLog({
    actorUserId,
    action: "EVAL_PROGRAM_UPDATED",
    entityType: "evaluation_program",
    entityId: programId,
    metadata: patch,
  });
  return mapProgram(data as Record<string, unknown>);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin — Attempts
// ─────────────────────────────────────────────────────────────────────────────

export async function adminListEvaluationAttempts(
  filters: { programId?: string; status?: string } = {}
): Promise<EvaluationAttemptDto[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("evaluation_attempts")
    .select(
      "*, evaluation_programs(name, slug), trading_accounts(account_name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.programId) query = query.eq("program_id", filters.programId);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapAttempt);
}

export async function adminLinkEvaluationAccount(
  attemptId: string,
  tradingAccountId: string,
  actorUserId: string
): Promise<EvaluationAttemptDto> {
  const supabase = createAdminClient();

  // Fetch the attempt and the account's initial_balance to snapshot
  const [{ data: attempt, error: aErr }, { data: account, error: accErr }] = await Promise.all([
    supabase.from("evaluation_attempts").select("id, status, program_id").eq("id", attemptId).maybeSingle(),
    supabase.from("trading_accounts").select("id, initial_balance, account_name").eq("id", tradingAccountId).maybeSingle(),
  ]);
  if (aErr) throw new Error(aErr.message);
  if (!attempt) throw new Error("Attempt not found");
  if (accErr) throw new Error(accErr.message);
  if (!account) throw new Error("Trading account not found");

  const { data: program } = await supabase
    .from("evaluation_programs")
    .select("starting_balance")
    .eq("id", (attempt as Record<string, unknown>).program_id as string)
    .maybeSingle();

  const startingBalance = program ? Number((program as Record<string, unknown>).starting_balance) : Number((account as Record<string, unknown>).initial_balance);

  const { data, error } = await supabase
    .from("evaluation_attempts")
    .update({
      trading_account_id: tradingAccountId,
      starting_balance: startingBalance,
      status: "ACTIVE",
      started_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })
    .eq("id", attemptId)
    .select("*, evaluation_programs(name, slug), trading_accounts(account_name)")
    .single();
  if (error) throw new Error(error.message);
  await writeAuditLog({
    actorUserId,
    action: "EVAL_ATTEMPT_CHECKED",
    entityType: "evaluation_attempt",
    entityId: attemptId,
    metadata: { action: "LINK_ACCOUNT", tradingAccountId },
  });
  return mapAttempt(data as Record<string, unknown>);
}

export async function adminRunEvaluationCheck(
  attemptId: string,
  actorUserId: string
): Promise<{ result: CheckResult; attempt: EvaluationAttemptDto }> {
  const checkResult = await evaluateAttempt(attemptId);
  const supabase = createAdminClient();

  const { data: current } = await supabase
    .from("evaluation_attempts")
    .select("status, user_id")
    .eq("id", attemptId)
    .maybeSingle();

  const statusBefore = (current as Record<string, unknown> | null)?.status as string | null;
  const userId = (current as Record<string, unknown> | null)?.user_id as string | null;

  const patch: Record<string, unknown> = { last_checked_at: new Date().toISOString() };
  if (checkResult.metrics) {
    patch.latest_metrics = checkResult.metrics;
  }

  let statusAfter = statusBefore;
  if (checkResult.result === "PASSED") {
    patch.status = "PASSED";
    patch.passed_at = new Date().toISOString();
    patch.pass_reason = checkResult.reason;
    statusAfter = "PASSED";
  } else if (checkResult.result === "FAILED") {
    patch.status = "FAILED";
    patch.failed_at = new Date().toISOString();
    patch.fail_reason = checkResult.reason;
    statusAfter = "FAILED";
  } else if (checkResult.result === "EXPIRED") {
    patch.status = "EXPIRED";
    patch.failed_at = new Date().toISOString();
    patch.fail_reason = checkResult.reason;
    statusAfter = "EXPIRED";
  } else if (checkResult.result === "NEEDS_REVIEW") {
    patch.status = "NEEDS_REVIEW";
    statusAfter = "NEEDS_REVIEW";
  }

  const [{ data: updated, error: uErr }] = await Promise.all([
    supabase
      .from("evaluation_attempts")
      .update(patch)
      .eq("id", attemptId)
      .select("*, evaluation_programs(name, slug), trading_accounts(account_name)")
      .single(),
    supabase.from("evaluation_checks").insert({
      attempt_id: attemptId,
      status_before: statusBefore,
      status_after: statusAfter,
      metrics: checkResult.metrics ?? {},
      result: checkResult.result,
      reason: checkResult.reason,
      checked_by: actorUserId,
      source: "ADMIN",
    }),
  ]);
  if (uErr) throw new Error(uErr.message);

  // Notify trader
  if (userId && (checkResult.result === "PASSED" || checkResult.result === "FAILED")) {
    await createNotification({
      userId,
      type: checkResult.result === "PASSED" ? "EVAL_PASSED" : "EVAL_FAILED",
      title: checkResult.result === "PASSED" ? "Evaluation Passed!" : "Evaluation Failed",
      message: checkResult.reason ?? (checkResult.result === "PASSED" ? "Congratulations on passing your evaluation!" : "Your evaluation did not meet the required conditions."),
    });
  }

  await writeAuditLog({
    actorUserId,
    action: "EVAL_ATTEMPT_CHECKED",
    entityType: "evaluation_attempt",
    entityId: attemptId,
    metadata: { result: checkResult.result, reason: checkResult.reason },
  });

  return { result: checkResult, attempt: mapAttempt(updated as Record<string, unknown>) };
}

export async function adminOverrideEvaluationAttempt(
  attemptId: string,
  input: OverrideAttemptInput
): Promise<EvaluationAttemptDto> {
  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error("Override reason is required (min 5 characters)");
  }
  const supabase = createAdminClient();

  const { data: current } = await supabase
    .from("evaluation_attempts")
    .select("status, user_id")
    .eq("id", attemptId)
    .maybeSingle();

  const statusBefore = (current as Record<string, unknown> | null)?.status as string | null;
  const userId = (current as Record<string, unknown> | null)?.user_id as string | null;

  const patch: Record<string, unknown> = {
    status: input.newStatus,
    admin_override_by: input.adminUserId,
    admin_override_reason: input.reason,
  };
  const now = new Date().toISOString();
  if (input.newStatus === "PASSED") { patch.passed_at = now; patch.pass_reason = input.reason; }
  if (input.newStatus === "FAILED") { patch.failed_at = now; patch.fail_reason = input.reason; }
  if (input.newStatus === "CANCELLED") { patch.cancelled_at = now; }

  const [{ data, error }, { error: cErr }] = await Promise.all([
    supabase
      .from("evaluation_attempts")
      .update(patch)
      .eq("id", attemptId)
      .select("*, evaluation_programs(name, slug), trading_accounts(account_name)")
      .single(),
    supabase.from("evaluation_checks").insert({
      attempt_id: attemptId,
      status_before: statusBefore,
      status_after: input.newStatus,
      metrics: {},
      result: input.newStatus === "PASSED" ? "PASSED" : "FAILED",
      reason: input.reason,
      checked_by: input.adminUserId,
      source: "ADMIN",
    }),
  ]);
  if (error) throw new Error(error.message);
  if (cErr) throw new Error(cErr.message);

  if (userId && input.newStatus !== "CANCELLED") {
    await createNotification({
      userId,
      type: input.newStatus === "PASSED" ? "EVAL_PASSED" : "EVAL_FAILED",
      title: input.newStatus === "PASSED" ? "Evaluation Passed (Admin Review)" : "Evaluation Failed (Admin Review)",
      message: input.reason,
    });
  }

  await writeAuditLog({
    actorUserId: input.adminUserId,
    action: "EVAL_ATTEMPT_OVERRIDDEN",
    entityType: "evaluation_attempt",
    entityId: attemptId,
    metadata: { newStatus: input.newStatus, reason: input.reason },
  });

  return mapAttempt(data as Record<string, unknown>);
}

// ─────────────────────────────────────────────────────────────────────────────
// Trader
// ─────────────────────────────────────────────────────────────────────────────

export async function listAvailableEvaluationPrograms(
  userId: string
): Promise<ProgramWithStatusDto[]> {
  const supabase = createAdminClient();
  const [programsRes, attemptsRes] = await Promise.all([
    supabase
      .from("evaluation_programs")
      .select("*, academy_courses(title)")
      .eq("status", "PUBLISHED")
      .order("created_at", { ascending: false }),
    supabase
      .from("evaluation_attempts")
      .select("id, program_id, status")
      .eq("user_id", userId),
  ]);
  if (programsRes.error) throw new Error(programsRes.error.message);

  const attemptMap = new Map<string, { id: string; status: string }>();
  for (const a of attemptsRes.data ?? []) {
    const r = a as Record<string, unknown>;
    attemptMap.set(r.program_id as string, { id: r.id as string, status: r.status as string });
  }

  const results: ProgramWithStatusDto[] = [];
  for (const raw of programsRes.data ?? []) {
    const prog = mapProgram(raw as Record<string, unknown>);
    const attempt = attemptMap.get(prog.id) ?? null;

    let academyProgressPercent: number | null = null;
    let isUnlocked = true;

    if (prog.requiredCourseId) {
      const progress = await calculateAcademyCompletion(userId, prog.requiredCourseId);
      academyProgressPercent = progress.progressPercent;
      isUnlocked = progress.progressPercent >= 100;
    }

    results.push({
      ...prog,
      attemptStatus: attempt?.status ?? null,
      attemptId: attempt?.id ?? null,
      isUnlocked,
      academyProgressPercent,
    });
  }
  return results;
}

export async function canStartEvaluation(
  userId: string,
  programId: string
): Promise<{ canStart: boolean; reason?: string }> {
  const supabase = createAdminClient();

  const { data: program } = await supabase
    .from("evaluation_programs")
    .select("id, status, required_course_id")
    .eq("id", programId)
    .maybeSingle();

  if (!program) return { canStart: false, reason: "PROGRAM_NOT_FOUND" };
  const p = program as Record<string, unknown>;
  if (p.status !== "PUBLISHED") return { canStart: false, reason: "PROGRAM_NOT_PUBLISHED" };

  // Check for existing attempt
  const { data: existing } = await supabase
    .from("evaluation_attempts")
    .select("id, status")
    .eq("program_id", programId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return { canStart: false, reason: "ATTEMPT_ALREADY_EXISTS" };

  // Check academy unlock
  if (p.required_course_id) {
    const progress = await calculateAcademyCompletion(userId, p.required_course_id as string);
    if (progress.progressPercent < 100) {
      return { canStart: false, reason: "ACADEMY_NOT_COMPLETED" };
    }
  }

  return { canStart: true };
}

export async function startEvaluationAttempt(
  userId: string,
  programId: string
): Promise<EvaluationAttemptDto> {
  const { canStart, reason } = await canStartEvaluation(userId, programId);
  if (!canStart) throw new Error(reason ?? "Cannot start evaluation");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("evaluation_attempts")
    .insert({ program_id: programId, user_id: userId, status: "PENDING" })
    .select("*, evaluation_programs(name, slug), trading_accounts(account_name)")
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actorUserId: userId,
    action: "EVAL_ATTEMPT_STARTED",
    entityType: "evaluation_attempt",
    entityId: (data as Record<string, unknown>).id as string,
    metadata: { programId },
  });

  return mapAttempt(data as Record<string, unknown>);
}

export async function getMyEvaluationAttempts(userId: string): Promise<EvaluationAttemptDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("evaluation_attempts")
    .select("*, evaluation_programs(name, slug), trading_accounts(account_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapAttempt(r as Record<string, unknown>));
}

export async function getMyEvaluationAttemptDetail(
  userId: string,
  attemptId: string
): Promise<EvaluationAttemptDto | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("evaluation_attempts")
    .select("*, evaluation_programs(name, slug, profit_target_percent, max_daily_drawdown_percent, max_overall_drawdown_percent, minimum_trading_days, duration_days, starting_balance), trading_accounts(account_name)")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapAttempt(data as Record<string, unknown>);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin — analytics
// ─────────────────────────────────────────────────────────────────────────────

export async function adminGetEvaluationAnalytics(): Promise<Record<string, unknown>> {
  const supabase = createAdminClient();
  const [programs, attempts, certs] = await Promise.all([
    supabase.from("evaluation_programs").select("id, status", { count: "exact" }),
    supabase.from("evaluation_attempts").select("id, status", { count: "exact" }),
    supabase.from("evaluation_certificates").select("id, status", { count: "exact" }),
  ]);

  const attemptsByStatus: Record<string, number> = {};
  for (const a of attempts.data ?? []) {
    const s = (a as Record<string, unknown>).status as string;
    attemptsByStatus[s] = (attemptsByStatus[s] ?? 0) + 1;
  }

  return {
    totalPrograms: programs.count ?? 0,
    publishedPrograms: (programs.data ?? []).filter((p) => (p as Record<string, unknown>).status === "PUBLISHED").length,
    totalAttempts: attempts.count ?? 0,
    attemptsByStatus,
    totalCertificates: certs.count ?? 0,
    validCertificates: (certs.data ?? []).filter((c) => (c as Record<string, unknown>).status === "VALID").length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────────

function mapProgram(r: Record<string, unknown>): EvaluationProgramDto {
  const course = r.academy_courses as Record<string, unknown> | null;
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    requiredCourseId: (r.required_course_id as string | null) ?? null,
    requiredCourseName: course ? (course.title as string) : null,
    startingBalance: Number(r.starting_balance),
    profitTargetPercent: Number(r.profit_target_percent),
    maxDailyDrawdownPercent: Number(r.max_daily_drawdown_percent),
    maxOverallDrawdownPercent: Number(r.max_overall_drawdown_percent),
    minimumTradingDays: Number(r.minimum_trading_days),
    durationDays: Number(r.duration_days),
    status: r.status as EvaluationProgramDto["status"],
    rules: (r.rules as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapAttempt(r: Record<string, unknown>): EvaluationAttemptDto {
  const prog = r.evaluation_programs as Record<string, unknown> | null;
  const acct = r.trading_accounts as Record<string, unknown> | null;
  return {
    id: r.id as string,
    programId: r.program_id as string,
    programName: prog ? (prog.name as string) : "",
    programSlug: prog ? (prog.slug as string) : "",
    userId: r.user_id as string,
    tradingAccountId: (r.trading_account_id as string | null) ?? null,
    tradingAccountName: acct ? (acct.account_name as string) : null,
    status: r.status as string,
    startingBalance: r.starting_balance != null ? Number(r.starting_balance) : null,
    startedAt: (r.started_at as string | null) ?? null,
    endsAt: (r.ends_at as string | null) ?? null,
    passedAt: (r.passed_at as string | null) ?? null,
    failedAt: (r.failed_at as string | null) ?? null,
    cancelledAt: (r.cancelled_at as string | null) ?? null,
    passReason: (r.pass_reason as string | null) ?? null,
    failReason: (r.fail_reason as string | null) ?? null,
    latestMetrics: (r.latest_metrics as Record<string, unknown>) ?? {},
    lastCheckedAt: (r.last_checked_at as string | null) ?? null,
    adminOverrideBy: (r.admin_override_by as string | null) ?? null,
    adminOverrideReason: (r.admin_override_reason as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}
