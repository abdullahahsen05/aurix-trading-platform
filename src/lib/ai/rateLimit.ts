import { createAdminClient } from "@/lib/supabase/admin";
import { AI_ERROR, AiError, type AiRoute, type AiUsageStatus, type RateLimitState, type TokenUsage } from "@/lib/ai/types";

const INITIAL_CREDITS = 50_000;

// ─────────────────────────────────────────────────────────────────────────────
// AI Assistant — per-user daily rate limiting + usage logging (server-only)
//
// Flow enforced by routes:
//   1. checkLimit()  — BEFORE calling Gemini. Throws AI_DISABLED / AI_RATE_LIMITED.
//   2. <Gemini call>
//   3. logUsage(SUCCESS) — AFTER a successful provider response (this is what
//      consumes the daily allowance, since only SUCCESS rows are counted).
//
// Failed validation never reaches checkLimit's consume path. Provider failures
// may be logged as FAILED for observability but DO NOT reduce the daily
// allowance, because the count query filters on status = 'SUCCESS'.
//
// Privacy: usage rows store METADATA ONLY — never prompts, responses,
// credentials, keys, or account payloads.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CHAT_LIMIT = 20;
const DEFAULT_CHART_LIMIT = 3;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function defaultLimitFor(route: AiRoute): number {
  return route === "chat"
    ? envInt("AI_CHAT_DAILY_LIMIT", DEFAULT_CHAT_LIMIT)
    : envInt("AI_CHART_DAILY_LIMIT", DEFAULT_CHART_LIMIT);
}

function utcDayStartIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Resolve a user's effective daily limit + credit balance for a route.
 * Throws AI_DISABLED or AI_RATE_LIMITED (credits exhausted).
 */
async function resolveLimit(
  userId: string,
  route: AiRoute,
): Promise<{ dailyLimit: number; credits: number }> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ai_user_limits")
    .select("chat_daily_limit, chart_daily_limit, ai_enabled, ai_token_credits")
    .eq("user_id", userId)
    .maybeSingle();

  if (data && data.ai_enabled === false) {
    throw new AiError(AI_ERROR.DISABLED, "AI access has been disabled for your account.", 403);
  }

  const credits: number = data?.ai_token_credits ?? INITIAL_CREDITS;
  if (credits <= 0) {
    throw new AiError(
      AI_ERROR.RATE_LIMITED,
      "Your AI token credits are exhausted. Contact support to top up.",
      429,
    );
  }

  const override = route === "chat" ? data?.chat_daily_limit : data?.chart_daily_limit;
  return { dailyLimit: override ?? defaultLimitFor(route), credits };
}

/**
 * Deduct tokens from a user's credit balance atomically. Balance floors at 0.
 * Never throws — a deduction failure is logged but does not break the response.
 */
export async function deductCredits(userId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  try {
    const supabase = createAdminClient();
    // Upsert ensures a row exists even for users pre-dating the trigger.
    await supabase.rpc("deduct_ai_credits", { p_user_id: userId, p_tokens: tokens });
  } catch (err) {
    console.error("[ai/rateLimit] failed to deduct credits:", err);
  }
}

/**
 * Count today's successful requests for this user + route (UTC day).
 */
async function countTodaySuccess(userId: string, route: AiRoute): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("route", route)
    .eq("status", "SUCCESS")
    .gte("created_at", utcDayStartIso());
  return count ?? 0;
}

/**
 * STEP 1 — call before the Gemini request.
 * Throws AI_DISABLED or AI_RATE_LIMITED. Returns the pre-consumption state.
 */
export async function checkLimit(userId: string, route: AiRoute): Promise<RateLimitState> {
  const { dailyLimit, credits } = await resolveLimit(userId, route);
  const used = await countTodaySuccess(userId, route);
  if (used >= dailyLimit) {
    throw new AiError(
      AI_ERROR.RATE_LIMITED,
      "You've reached today's AI limit. It resets at 00:00 UTC.",
      429,
    );
  }
  return { limit: dailyLimit, used, remaining: dailyLimit - used, creditsRemaining: credits };
}

/**
 * STEP 3 — call after a successful Gemini response (or to record a failure).
 * On SUCCESS, deducts actual tokens from the user's credit balance.
 * Uses total_tokens if available, otherwise estimates from prompt+completion.
 * Never throws — a logging/deduction failure must not break the response.
 */
export async function logUsage(params: {
  userId: string;
  route: AiRoute;
  model: string;
  requestType: string;
  status: AiUsageStatus;
  usage?: TokenUsage;
  estimatedCost?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("ai_usage_logs").insert({
      user_id: params.userId,
      route: params.route,
      model: params.model,
      request_type: params.requestType,
      status: params.status,
      prompt_tokens: params.usage?.promptTokens ?? null,
      completion_tokens: params.usage?.completionTokens ?? null,
      total_tokens: params.usage?.totalTokens ?? null,
      estimated_cost: params.estimatedCost ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (err) {
    console.error("[ai/rateLimit] failed to log usage:", err);
  }

  // Deduct from credit balance on successful calls only.
  if (params.status === "SUCCESS" && params.usage) {
    const tokens =
      params.usage.totalTokens ??
      (params.usage.promptTokens ?? 0) + (params.usage.completionTokens ?? 0);
    if (tokens > 0) {
      await deductCredits(params.userId, tokens);
    }
  }
}
