import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// AI Admin Service (server-only) — usage analytics + per-user limit management.
// All reads/writes go through the service-role admin client; routes gate with
// requireAdmin(). Usage rows are metadata-only (no prompts/responses).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CHAT_LIMIT = Number.parseInt(process.env.AI_CHAT_DAILY_LIMIT ?? "20", 10) || 20;
const DEFAULT_CHART_LIMIT = Number.parseInt(process.env.AI_CHART_DAILY_LIMIT ?? "3", 10) || 3;

function utcDayStartIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export interface AiUsageLogRow {
  id: string;
  userId: string;
  userName: string;
  route: "chat" | "chart-analysis";
  model: string;
  requestType: string;
  status: "SUCCESS" | "FAILED";
  totalTokens: number | null;
  createdAt: string;
}

export interface AiUsageSummary {
  today: {
    total: number;
    chat: number;
    chartAnalysis: number;
    failed: number;
  };
  byUserToday: Array<{ userId: string; userName: string; chat: number; chartAnalysis: number }>;
  recent: AiUsageLogRow[];
}

interface RawLog {
  id: string;
  user_id: string;
  route: "chat" | "chart-analysis";
  model: string;
  request_type: string;
  status: "SUCCESS" | "FAILED";
  total_tokens: number | null;
  created_at: string;
}

async function nameMap(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return map;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", unique);
  for (const p of data ?? []) {
    map.set(p.id, (p.full_name as string) || (p.email as string) || p.id);
  }
  return map;
}

export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  const supabase = createAdminClient();
  const dayStart = utcDayStartIso();

  // Today's rows (bounded) for aggregation.
  const { data: todayRows, error: todayErr } = await supabase
    .from("ai_usage_logs")
    .select("id, user_id, route, model, request_type, status, total_tokens, created_at")
    .gte("created_at", dayStart)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (todayErr) throw new Error(`Failed to fetch AI usage: ${todayErr.message}`);

  // Recent rows across all time for the activity table.
  const { data: recentRows, error: recentErr } = await supabase
    .from("ai_usage_logs")
    .select("id, user_id, route, model, request_type, status, total_tokens, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (recentErr) throw new Error(`Failed to fetch recent AI usage: ${recentErr.message}`);

  const today = (todayRows ?? []) as RawLog[];
  const recent = (recentRows ?? []) as RawLog[];

  const names = await nameMap([...today.map((r) => r.user_id), ...recent.map((r) => r.user_id)]);

  const summary: AiUsageSummary["today"] = { total: 0, chat: 0, chartAnalysis: 0, failed: 0 };
  const perUser = new Map<string, { chat: number; chartAnalysis: number }>();

  for (const r of today) {
    if (r.status !== "SUCCESS") {
      summary.failed += 1;
      continue;
    }
    summary.total += 1;
    if (r.route === "chat") summary.chat += 1;
    else summary.chartAnalysis += 1;

    const u = perUser.get(r.user_id) ?? { chat: 0, chartAnalysis: 0 };
    if (r.route === "chat") u.chat += 1;
    else u.chartAnalysis += 1;
    perUser.set(r.user_id, u);
  }

  return {
    today: summary,
    byUserToday: [...perUser.entries()].map(([userId, counts]) => ({
      userId,
      userName: names.get(userId) ?? userId,
      ...counts,
    })),
    recent: recent.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: names.get(r.user_id) ?? r.user_id,
      route: r.route,
      model: r.model,
      requestType: r.request_type,
      status: r.status,
      totalTokens: r.total_tokens,
      createdAt: r.created_at,
    })),
  };
}

export interface AiUserRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  aiEnabled: boolean;
  chatDailyLimit: number | null;
  chartDailyLimit: number | null;
  effectiveChatLimit: number;
  effectiveChartLimit: number;
  chatUsedToday: number;
  chartUsedToday: number;
  aiTokenCredits: number;
}

export async function listAiUsers(): Promise<AiUserRow[]> {
  const supabase = createAdminClient();

  const [{ data: profiles, error: pErr }, { data: limits, error: lErr }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("ai_user_limits").select("user_id, chat_daily_limit, chart_daily_limit, ai_enabled, ai_token_credits"),
  ]);
  if (pErr) throw new Error(`Failed to fetch users: ${pErr.message}`);
  if (lErr) throw new Error(`Failed to fetch AI limits: ${lErr.message}`);

  // Today's success counts grouped per user+route.
  const { data: todayRows } = await supabase
    .from("ai_usage_logs")
    .select("user_id, route, status, created_at")
    .gte("created_at", utcDayStartIso())
    .eq("status", "SUCCESS")
    .limit(5000);

  const usage = new Map<string, { chat: number; chart: number }>();
  for (const r of todayRows ?? []) {
    const u = usage.get(r.user_id) ?? { chat: 0, chart: 0 };
    if (r.route === "chat") u.chat += 1;
    else u.chart += 1;
    usage.set(r.user_id, u);
  }

  const limitMap = new Map(
    (limits ?? []).map((l) => [
      l.user_id,
      {
        chat: l.chat_daily_limit as number | null,
        chart: l.chart_daily_limit as number | null,
        enabled: l.ai_enabled as boolean,
        credits: (l.ai_token_credits as number) ?? 50000,
      },
    ]),
  );

  return (profiles ?? []).map((p) => {
    const lim = limitMap.get(p.id);
    const used = usage.get(p.id) ?? { chat: 0, chart: 0 };
    const chatLimit = lim?.chat ?? null;
    const chartLimit = lim?.chart ?? null;
    return {
      userId: p.id,
      name: (p.full_name as string) || (p.email as string),
      email: p.email as string,
      role: p.role as string,
      aiEnabled: lim?.enabled ?? true,
      chatDailyLimit: chatLimit,
      chartDailyLimit: chartLimit,
      effectiveChatLimit: chatLimit ?? DEFAULT_CHAT_LIMIT,
      effectiveChartLimit: chartLimit ?? DEFAULT_CHART_LIMIT,
      chatUsedToday: used.chat,
      chartUsedToday: used.chart,
      aiTokenCredits: lim?.credits ?? 50000,
    };
  });
}

export async function updateAiUserLimits(
  userId: string,
  patch: { chatDailyLimit?: number | null; chartDailyLimit?: number | null; aiEnabled?: boolean },
): Promise<void> {
  const supabase = createAdminClient();
  const row: Record<string, unknown> = { user_id: userId };
  if (patch.chatDailyLimit !== undefined) row.chat_daily_limit = patch.chatDailyLimit;
  if (patch.chartDailyLimit !== undefined) row.chart_daily_limit = patch.chartDailyLimit;
  if (patch.aiEnabled !== undefined) row.ai_enabled = patch.aiEnabled;

  const { error } = await supabase
    .from("ai_user_limits")
    .upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(`Failed to update AI limits: ${error.message}`);
}
