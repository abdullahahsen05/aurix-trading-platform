import { createAdminClient } from "@/lib/supabase/admin";
import { AI_ERROR, AiError, type AiRoute, type AiUsageStatus, type RateLimitState, type TokenUsage } from "@/lib/ai/types";

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
 * Resolve a user's effective daily limit for a route and ensure AI is enabled.
 * Throws AI_DISABLED if an admin has switched the user off.
 */
async function resolveLimit(userId: string, route: AiRoute): Promise<number> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ai_user_limits")
    .select("chat_daily_limit, chart_daily_limit, ai_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (data && data.ai_enabled === false) {
    throw new AiError(AI_ERROR.DISABLED, "AI access has been disabled for your account.", 403);
  }

  const override = route === "chat" ? data?.chat_daily_limit : data?.chart_daily_limit;
  return override ?? defaultLimitFor(route);
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
  const limit = await resolveLimit(userId, route);
  const used = await countTodaySuccess(userId, route);
  if (used >= limit) {
    throw new AiError(
      AI_ERROR.RATE_LIMITED,
      "You've reached today's AI limit. It resets at 00:00 UTC.",
      429,
    );
  }
  return { limit, used, remaining: limit - used };
}

/**
 * STEP 3 — call after a successful Gemini response (or to record a failure).
 * Metadata only. Never throws — a logging failure must not break the response.
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
}
