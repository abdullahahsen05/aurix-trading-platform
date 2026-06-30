import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/auditService";
import { calculateFollowerLot } from "@/lib/copy/lotScaling";
import { evaluateFollowerEligibility } from "@/lib/copy/eligibility";
import { BrokerExecutionError, MetaApiBrokerAdapter } from "@/lib/broker/MetaApiBrokerAdapter";
import { logBrokerOperation } from "@/lib/services/brokerOperationLog";
import {
  COPY_ERROR,
  CopyError,
  type CopyFollowerDto,
  type CopyGlobalSettingsDto,
  type CopyLogDto,
  type CopyStrategyDto,
  type MasterEventDto,
  type ScalingMode,
} from "@/lib/copy/types";

// ─────────────────────────────────────────────────────────────────────────────
// Copy Trading Service (server-only). All access is via the service-role admin
// client; routes gate with requireAdmin()/requireTrader() and trader functions
// filter by the authenticated trader_id. Simulation-first; live execution is
// guarded and currently unconfigured (see executeCopyForEvent).
// ─────────────────────────────────────────────────────────────────────────────

// ── Global settings ──────────────────────────────────────────────────────────

export async function getCopyGlobalSettings(): Promise<CopyGlobalSettingsDto> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("copy_global_settings")
    .select("live_copy_enabled, emergency_stop_enabled, updated_at")
    .eq("id", true)
    .maybeSingle();
  return {
    liveCopyEnabled: data?.live_copy_enabled ?? false,
    emergencyStopEnabled: data?.emergency_stop_enabled ?? false,
    updatedAt: data?.updated_at ?? new Date(0).toISOString(),
  };
}

export async function updateCopyGlobalSettings(
  patch: { liveCopyEnabled?: boolean; emergencyStopEnabled?: boolean },
  actorUserId: string,
): Promise<CopyGlobalSettingsDto> {
  const supabase = createAdminClient();
  const row: Record<string, unknown> = { id: true, updated_by: actorUserId };
  if (patch.liveCopyEnabled !== undefined) row.live_copy_enabled = patch.liveCopyEnabled;
  if (patch.emergencyStopEnabled !== undefined) row.emergency_stop_enabled = patch.emergencyStopEnabled;

  const { error } = await supabase.from("copy_global_settings").upsert(row, { onConflict: "id" });
  if (error) throw new Error(`Failed to update copy settings: ${error.message}`);

  await writeAuditLog({
    actorUserId,
    action: "COPY_SETTINGS_CHANGED",
    entityType: "copy_global_settings",
    entityId: null,
    metadata: { ...patch },
  });
  return getCopyGlobalSettings();
}

// ── Strategies ───────────────────────────────────────────────────────────────

interface StrategyRow {
  id: string;
  name: string;
  description: string | null;
  master_account_id: string;
  status: CopyStrategyDto["status"];
  mode: CopyStrategyDto["mode"];
  live_enabled: boolean;
  risk_multiplier: number | string;
  default_scaling_mode: ScalingMode;
  max_follower_lot: number | string | null;
  max_open_copied_trades: number | null;
  symbol_allowlist: string[] | null;
  symbol_blocklist: string[] | null;
  created_at: string;
}

function mapStrategy(
  row: StrategyRow,
  masterName: string | null,
  followerCount: number,
): CopyStrategyDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    masterAccountId: row.master_account_id,
    masterAccountName: masterName,
    status: row.status,
    mode: row.mode,
    liveEnabled: row.live_enabled,
    riskMultiplier: Number(row.risk_multiplier),
    defaultScalingMode: row.default_scaling_mode,
    maxFollowerLot: row.max_follower_lot === null ? null : Number(row.max_follower_lot),
    maxOpenCopiedTrades: row.max_open_copied_trades,
    symbolAllowlist: row.symbol_allowlist,
    symbolBlocklist: row.symbol_blocklist,
    followerCount,
    createdAt: row.created_at,
  };
}

const STRATEGY_COLS =
  "id, name, description, master_account_id, status, mode, live_enabled, risk_multiplier, default_scaling_mode, max_follower_lot, max_open_copied_trades, symbol_allowlist, symbol_blocklist, created_at";

export async function listCopyStrategies(): Promise<CopyStrategyDto[]> {
  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("copy_strategies")
    .select(STRATEGY_COLS)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Failed to fetch strategies: ${error.message}`);

  const strategies = (rows ?? []) as StrategyRow[];
  if (strategies.length === 0) return [];

  const masterIds = [...new Set(strategies.map((s) => s.master_account_id))];
  const strategyIds = strategies.map((s) => s.id);

  const [{ data: accounts }, { data: followers }] = await Promise.all([
    supabase.from("trading_accounts").select("id, account_name").in("id", masterIds),
    supabase.from("copy_strategy_followers").select("strategy_id").in("strategy_id", strategyIds),
  ]);

  const nameByAccount = new Map((accounts ?? []).map((a) => [a.id, a.account_name as string]));
  const followerCount = new Map<string, number>();
  for (const f of followers ?? []) {
    followerCount.set(f.strategy_id, (followerCount.get(f.strategy_id) ?? 0) + 1);
  }

  return strategies.map((s) =>
    mapStrategy(s, nameByAccount.get(s.master_account_id) ?? null, followerCount.get(s.id) ?? 0),
  );
}

async function getStrategyRow(strategyId: string): Promise<StrategyRow> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("copy_strategies").select(STRATEGY_COLS).eq("id", strategyId).maybeSingle();
  if (!data) throw new CopyError(COPY_ERROR.COPY_STRATEGY_NOT_FOUND, "Strategy not found", 404);
  return data as StrategyRow;
}

export async function createCopyStrategy(
  input: {
    name: string;
    description?: string | null;
    masterAccountId: string;
    riskMultiplier: number;
    defaultScalingMode: ScalingMode;
    maxFollowerLot?: number | null;
    maxOpenCopiedTrades?: number | null;
    symbolAllowlist?: string[] | null;
    symbolBlocklist?: string[] | null;
  },
  actorUserId: string,
): Promise<CopyStrategyDto> {
  const supabase = createAdminClient();

  const { data: master } = await supabase
    .from("trading_accounts")
    .select("id, account_name")
    .eq("id", input.masterAccountId)
    .maybeSingle();
  if (!master) throw new CopyError(COPY_ERROR.MASTER_ACCOUNT_NOT_FOUND, "Master account not found", 404);

  const { data, error } = await supabase
    .from("copy_strategies")
    .insert({
      name: input.name,
      description: input.description ?? null,
      master_account_id: input.masterAccountId,
      risk_multiplier: input.riskMultiplier,
      default_scaling_mode: input.defaultScalingMode,
      max_follower_lot: input.maxFollowerLot ?? null,
      max_open_copied_trades: input.maxOpenCopiedTrades ?? null,
      symbol_allowlist: input.symbolAllowlist ?? null,
      symbol_blocklist: input.symbolBlocklist ?? null,
      created_by: actorUserId,
    })
    .select(STRATEGY_COLS)
    .single();
  if (error || !data) throw new Error(`Failed to create strategy: ${error?.message}`);

  await writeAuditLog({
    actorUserId,
    action: "COPY_STRATEGY_CREATED",
    entityType: "copy_strategy",
    entityId: data.id,
    metadata: { name: input.name, masterAccountId: input.masterAccountId },
  });
  return mapStrategy(data as StrategyRow, (master.account_name as string) ?? null, 0);
}

export async function updateCopyStrategy(
  strategyId: string,
  patch: Record<string, unknown>,
  actorUserId: string,
): Promise<CopyStrategyDto> {
  const supabase = createAdminClient();

  // Map camelCase patch → snake_case columns (whitelist).
  const row: Record<string, unknown> = {};
  const map: Record<string, string> = {
    name: "name",
    description: "description",
    status: "status",
    mode: "mode",
    liveEnabled: "live_enabled",
    riskMultiplier: "risk_multiplier",
    defaultScalingMode: "default_scaling_mode",
    maxFollowerLot: "max_follower_lot",
    maxOpenCopiedTrades: "max_open_copied_trades",
    symbolAllowlist: "symbol_allowlist",
    symbolBlocklist: "symbol_blocklist",
  };
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) row[col] = patch[k];
  }

  const { data, error } = await supabase
    .from("copy_strategies")
    .update(row)
    .eq("id", strategyId)
    .select(STRATEGY_COLS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update strategy: ${error.message}`);
  if (!data) throw new CopyError(COPY_ERROR.COPY_STRATEGY_NOT_FOUND, "Strategy not found", 404);

  await writeAuditLog({
    actorUserId,
    action: "COPY_STRATEGY_UPDATED",
    entityType: "copy_strategy",
    entityId: strategyId,
    metadata: { fields: Object.keys(row), liveEnabled: patch.liveEnabled, mode: patch.mode },
  });

  const { data: master } = await supabase
    .from("trading_accounts")
    .select("account_name")
    .eq("id", (data as StrategyRow).master_account_id)
    .maybeSingle();
  return mapStrategy(data as StrategyRow, (master?.account_name as string) ?? null, 0);
}

// ── Master monitoring ──────────────────────────────────────────────────────

function mapEvent(row: {
  id: string;
  strategy_id: string;
  event_type: MasterEventDto["eventType"];
  master_trade_id: string;
  symbol: string;
  side: string | null;
  volume: number | string | null;
  open_price: number | string | null;
  close_price: number | string | null;
  event_time: string;
  created_at: string;
}): MasterEventDto {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    eventType: row.event_type,
    masterTradeId: row.master_trade_id,
    symbol: row.symbol,
    side: row.side,
    volume: row.volume === null ? null : Number(row.volume),
    openPrice: row.open_price === null ? null : Number(row.open_price),
    closePrice: row.close_price === null ? null : Number(row.close_price),
    eventTime: row.event_time,
    createdAt: row.created_at,
  };
}

const EVENT_COLS =
  "id, strategy_id, event_type, master_trade_id, symbol, side, volume, open_price, close_price, event_time, created_at";

/**
 * Detect new OPEN/CLOSE events on the master account by diffing its `trades`
 * rows against previously recorded master events. (MODIFY detection requires
 * broker SL/TP which the trades table does not store — documented in the design.)
 * Records new events only; never copies.
 */
export async function monitorMasterAccount(
  strategyId: string,
  actorUserId: string | null,
): Promise<{ detected: number }> {
  const strategy = await getStrategyRow(strategyId);
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("copy_master_events")
    .select("dedupe_key")
    .eq("strategy_id", strategyId)
    .limit(10000);
  const seen = new Set((existing ?? []).map((e) => e.dedupe_key as string));

  const { data: masterTrades } = await supabase
    .from("trades")
    .select("id, symbol, side, status, volume, open_price, close_price, opened_at, closed_at")
    .eq("trading_account_id", strategy.master_account_id)
    .order("opened_at", { ascending: false })
    .limit(200);

  const newEvents: Record<string, unknown>[] = [];
  for (const t of masterTrades ?? []) {
    const openKey = `${strategyId}:${t.id}:OPEN`;
    if (!seen.has(openKey)) {
      newEvents.push({
        strategy_id: strategyId,
        master_account_id: strategy.master_account_id,
        event_type: "OPEN",
        master_trade_id: t.id,
        symbol: t.symbol,
        side: t.side,
        volume: t.volume,
        open_price: t.open_price,
        event_time: t.opened_at,
        dedupe_key: openKey,
        raw_payload: { source: "trades", trade: t },
      });
    }
    if (t.status === "CLOSED") {
      const closeKey = `${strategyId}:${t.id}:CLOSE`;
      if (!seen.has(closeKey)) {
        newEvents.push({
          strategy_id: strategyId,
          master_account_id: strategy.master_account_id,
          event_type: "CLOSE",
          master_trade_id: t.id,
          symbol: t.symbol,
          side: t.side,
          volume: t.volume,
          open_price: t.open_price,
          close_price: t.close_price,
          event_time: t.closed_at ?? t.opened_at,
          dedupe_key: closeKey,
          raw_payload: { source: "trades", trade: t },
        });
      }
    }
  }

  if (newEvents.length > 0) {
    // ignoreDuplicates guards against a concurrent monitor run.
    const { error } = await supabase
      .from("copy_master_events")
      .upsert(newEvents, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (error) throw new Error(`Failed to record master events: ${error.message}`);
  }

  await writeAuditLog({
    actorUserId,
    action: "COPY_MASTER_MONITORED",
    entityType: "copy_strategy",
    entityId: strategyId,
    metadata: { detected: newEvents.length },
  });
  return { detected: newEvents.length };
}

export async function listMasterEvents(strategyId: string): Promise<MasterEventDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("copy_master_events")
    .select(EVENT_COLS)
    .eq("strategy_id", strategyId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Failed to fetch master events: ${error.message}`);
  return (data ?? []).map(mapEvent);
}

// ── Simulation ─────────────────────────────────────────────────────────────

interface SnapshotLite {
  equity: number;
  balance: number;
}

async function getSnapshot(accountId: string): Promise<SnapshotLite | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("latest_account_snapshots")
    .select("equity, balance")
    .eq("trading_account_id", accountId)
    .maybeSingle();
  if (!data) return null;
  return { equity: Number(data.equity), balance: Number(data.balance) };
}

interface FollowerRow {
  id: string;
  follower_account_id: string;
  trader_id: string;
  status: CopyFollowerDto["status"];
  scaling_mode: ScalingMode | null;
  risk_multiplier: number | string | null;
  fixed_lot: number | string | null;
  max_lot: number | string | null;
  max_open_trades: number | null;
  max_daily_loss_percent: number | string | null;
  max_drawdown_percent: number | string | null;
  symbol_allowlist: string[] | null;
  symbol_blocklist: string[] | null;
  consent_accepted_at: string | null;
}

async function loadActiveFollowers(strategyId: string): Promise<FollowerRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("copy_strategy_followers")
    .select(
      "id, follower_account_id, trader_id, status, scaling_mode, risk_multiplier, fixed_lot, max_lot, max_open_trades, max_daily_loss_percent, max_drawdown_percent, symbol_allowlist, symbol_blocklist, consent_accepted_at",
    )
    .eq("strategy_id", strategyId)
    .eq("status", "ACTIVE")
    .limit(2000);
  return (data ?? []) as FollowerRow[];
}

interface SimResult {
  simulated: number;
  success: number;
  skipped: number;
  failed: number;
}

async function simulateOneEvent(eventRow: {
  id: string;
  strategy_id: string;
  event_type: "OPEN" | "CLOSE" | "MODIFY";
  symbol: string;
  side: string | null;
  volume: number | string | null;
}, strategy: StrategyRow, emergencyStop: boolean): Promise<SimResult> {
  const supabase = createAdminClient();
  const followers = await loadActiveFollowers(strategy.id);
  const result: SimResult = { simulated: 0, success: 0, skipped: 0, failed: 0 };
  if (followers.length === 0) return result;

  const masterSnap = await getSnapshot(strategy.master_account_id);
  const masterLot = eventRow.volume === null ? 0 : Number(eventRow.volume);

  // Follower account statuses + snapshots.
  const accountIds = followers.map((f) => f.follower_account_id);
  const { data: accountRows } = await supabase
    .from("trading_accounts")
    .select("id, status")
    .in("id", accountIds);
  const statusByAccount = new Map((accountRows ?? []).map((a) => [a.id, a.status as string]));

  const logs: Record<string, unknown>[] = [];

  for (const f of followers) {
    const accountStatus = statusByAccount.get(f.follower_account_id) ?? "DISCONNECTED";
    const followerSnap = await getSnapshot(f.follower_account_id);

    const elig = evaluateFollowerEligibility({
      globalEmergencyStop: emergencyStop,
      followerStatus: f.status,
      consentAccepted: Boolean(f.consent_accepted_at),
      accountStatus,
      symbol: eventRow.symbol,
      symbolAllowlist: f.symbol_allowlist ?? strategy.symbol_allowlist,
      symbolBlocklist: f.symbol_blocklist ?? strategy.symbol_blocklist,
      maxOpenTrades: f.max_open_trades,
      maxDrawdownPercent: f.max_drawdown_percent === null ? null : Number(f.max_drawdown_percent),
    });

    const baseLog = {
      strategy_id: strategy.id,
      master_event_id: eventRow.id,
      follower_account_id: f.follower_account_id,
      trader_id: f.trader_id,
      mode: "SIMULATION",
      symbol: eventRow.symbol,
      side: eventRow.side,
    };

    if (!elig.eligible) {
      logs.push({ ...baseLog, action: "SKIPPED", status: "SKIPPED", error_code: COPY_ERROR.FOLLOWER_NOT_ELIGIBLE, error_message: elig.reason });
      result.skipped++;
      continue;
    }

    const lot = calculateFollowerLot({
      masterLot,
      masterEquity: masterSnap?.equity ?? null,
      masterBalance: masterSnap?.balance ?? null,
      followerEquity: followerSnap?.equity ?? null,
      followerBalance: followerSnap?.balance ?? null,
      scalingMode: (f.scaling_mode ?? strategy.default_scaling_mode) as ScalingMode,
      riskMultiplier: f.risk_multiplier === null ? Number(strategy.risk_multiplier) : Number(f.risk_multiplier),
      fixedLot: f.fixed_lot === null ? null : Number(f.fixed_lot),
      maxLot: f.max_lot === null ? (strategy.max_follower_lot === null ? null : Number(strategy.max_follower_lot)) : Number(f.max_lot),
    });

    if (lot.lot <= 0) {
      logs.push({ ...baseLog, action: "SKIPPED", status: "SKIPPED", error_code: COPY_ERROR.COPY_INVALID_LOT, error_message: lot.reason, calculated_lot: 0 });
      result.skipped++;
      continue;
    }

    logs.push({ ...baseLog, action: eventRow.event_type, status: "SUCCESS", calculated_lot: lot.lot });
    result.success++;
  }

  result.simulated = logs.length;
  if (logs.length > 0) {
    const { error } = await supabase.from("copy_execution_logs").insert(logs);
    if (error) throw new Error(`Failed to write simulation logs: ${error.message}`);
  }
  return result;
}

export async function simulateCopyForEvent(eventId: string, actorUserId: string | null): Promise<SimResult> {
  const supabase = createAdminClient();
  const { data: ev } = await supabase
    .from("copy_master_events")
    .select("id, strategy_id, event_type, symbol, side, volume")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) throw new CopyError(COPY_ERROR.COPY_DUPLICATE_EVENT, "Master event not found", 404);

  const strategy = await getStrategyRow(ev.strategy_id);
  const settings = await getCopyGlobalSettings();
  const result = await simulateOneEvent(ev as Parameters<typeof simulateOneEvent>[0], strategy, settings.emergencyStopEnabled);

  await writeAuditLog({
    actorUserId,
    action: "COPY_SIMULATED",
    entityType: "copy_master_event",
    entityId: eventId,
    metadata: { ...result },
  });
  return result;
}

export async function simulateStrategy(strategyId: string, actorUserId: string | null): Promise<SimResult> {
  const strategy = await getStrategyRow(strategyId);
  const settings = await getCopyGlobalSettings();
  const supabase = createAdminClient();

  // Simulate only events that have no SIMULATION log yet (avoid piling duplicates).
  const { data: events } = await supabase
    .from("copy_master_events")
    .select("id, strategy_id, event_type, symbol, side, volume")
    .eq("strategy_id", strategyId)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: simmed } = await supabase
    .from("copy_execution_logs")
    .select("master_event_id")
    .eq("strategy_id", strategyId)
    .eq("mode", "SIMULATION")
    .limit(10000);
  const simmedSet = new Set((simmed ?? []).map((l) => l.master_event_id as string));

  const total: SimResult = { simulated: 0, success: 0, skipped: 0, failed: 0 };
  for (const ev of events ?? []) {
    if (simmedSet.has(ev.id)) continue;
    const r = await simulateOneEvent(ev as Parameters<typeof simulateOneEvent>[0], strategy, settings.emergencyStopEnabled);
    total.simulated += r.simulated;
    total.success += r.success;
    total.skipped += r.skipped;
    total.failed += r.failed;
  }

  await writeAuditLog({
    actorUserId,
    action: "COPY_SIMULATED",
    entityType: "copy_strategy",
    entityId: strategyId,
    metadata: { ...total },
  });
  return total;
}

// ── Logs ─────────────────────────────────────────────────────────────────────

function mapLog(row: {
  id: string;
  strategy_id: string;
  master_event_id: string;
  follower_account_id: string | null;
  trader_id: string | null;
  mode: CopyLogDto["mode"];
  action: CopyLogDto["action"];
  status: CopyLogDto["status"];
  calculated_lot: number | string | null;
  executed_lot: number | string | null;
  symbol: string | null;
  side: string | null;
  broker_order_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}): CopyLogDto {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    masterEventId: row.master_event_id,
    followerAccountId: row.follower_account_id,
    traderId: row.trader_id,
    mode: row.mode,
    action: row.action,
    status: row.status,
    calculatedLot: row.calculated_lot === null ? null : Number(row.calculated_lot),
    executedLot: row.executed_lot === null ? null : Number(row.executed_lot),
    symbol: row.symbol,
    side: row.side,
    brokerOrderId: row.broker_order_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

const LOG_COLS =
  "id, strategy_id, master_event_id, follower_account_id, trader_id, mode, action, status, calculated_lot, executed_lot, symbol, side, broker_order_id, error_code, error_message, created_at";

export async function listCopyLogs(filters?: { strategyId?: string }): Promise<CopyLogDto[]> {
  const supabase = createAdminClient();
  let query = supabase.from("copy_execution_logs").select(LOG_COLS).order("created_at", { ascending: false }).limit(500);
  if (filters?.strategyId) query = query.eq("strategy_id", filters.strategyId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch copy logs: ${error.message}`);
  return (data ?? []).map(mapLog);
}

// ── Live execution (GUARDED — currently not configured) ──────────────────────

export interface ExecSummary {
  attempted: number;
  success: number;
  failed: number;
  skipped: number;
}

export async function executeCopyForEvent(eventId: string, actorUserId: string | null): Promise<ExecSummary> {
  const supabase = createAdminClient();
  const { data: ev } = await supabase
    .from("copy_master_events")
    .select("id, strategy_id, event_type, symbol, side, volume")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) throw new CopyError(COPY_ERROR.COPY_DUPLICATE_EVENT, "Master event not found", 404);

  const strategy = await getStrategyRow(ev.strategy_id);
  const settings = await getCopyGlobalSettings();

  // Safety gates — every one must pass before any broker call is even attempted.
  if (settings.emergencyStopEnabled) {
    throw new CopyError(COPY_ERROR.COPY_EMERGENCY_STOP, "Emergency stop is enabled — live copy blocked.", 423);
  }
  if (!settings.liveCopyEnabled) {
    throw new CopyError(COPY_ERROR.COPY_LIVE_DISABLED, "Global live copy is disabled.", 403);
  }
  if (strategy.mode !== "LIVE" || !strategy.live_enabled) {
    throw new CopyError(COPY_ERROR.COPY_LIVE_DISABLED, "This strategy is not live-enabled.", 403);
  }

  await writeAuditLog({
    actorUserId,
    action: "COPY_LIVE_ATTEMPTED",
    entityType: "copy_master_event",
    entityId: eventId,
    metadata: { strategyId: strategy.id },
  });

  // Provider gate: live execution must use the real broker adapter AND the
  // operator must have explicitly enabled execution (BROKER_EXECUTION_ENABLED).
  // Otherwise we refuse rather than fabricate an order.
  const adapter = new MetaApiBrokerAdapter();
  if (!adapter.executionAvailable()) {
    throw new CopyError(
      COPY_ERROR.COPY_EXECUTION_NOT_CONFIGURED,
      "Live copy execution is not enabled. Set BROKER_EXECUTION_ENABLED=true (after demo testing) to allow live orders.",
      501,
    );
  }

  // Only OPEN events are executed live in this MVP. CLOSE/MODIFY require a
  // master→follower position-id mapping which is not tracked yet.
  if (ev.event_type !== "OPEN") {
    throw new CopyError(
      COPY_ERROR.COPY_EXECUTION_NOT_CONFIGURED,
      `Live copy of ${ev.event_type} events is not supported yet (only OPEN).`,
      501,
    );
  }

  const followers = await loadActiveFollowers(strategy.id);
  const summary: ExecSummary = { attempted: 0, success: 0, failed: 0, skipped: 0 };
  if (followers.length === 0) return summary;

  const masterSnap = await getSnapshot(strategy.master_account_id);
  const masterLot = ev.volume === null ? 0 : Number(ev.volume);

  const accountIds = followers.map((f) => f.follower_account_id);
  const { data: accountRows } = await supabase
    .from("trading_accounts")
    .select("id, status")
    .in("id", accountIds);
  const statusByAccount = new Map((accountRows ?? []).map((a) => [a.id, a.status as string]));

  for (const f of followers) {
    const baseLog = {
      strategy_id: strategy.id,
      master_event_id: ev.id,
      follower_account_id: f.follower_account_id,
      trader_id: f.trader_id,
      mode: "LIVE" as const,
      symbol: ev.symbol,
      side: ev.side,
    };

    // Idempotency: skip if this follower already has a successful live OPEN for this event.
    const { data: existing } = await supabase
      .from("copy_execution_logs")
      .select("id")
      .eq("master_event_id", ev.id)
      .eq("follower_account_id", f.follower_account_id)
      .eq("action", "OPEN")
      .eq("mode", "LIVE")
      .eq("status", "SUCCESS")
      .maybeSingle();
    if (existing) {
      summary.skipped++;
      continue;
    }

    const accountStatus = statusByAccount.get(f.follower_account_id) ?? "DISCONNECTED";
    const elig = evaluateFollowerEligibility({
      globalEmergencyStop: settings.emergencyStopEnabled,
      followerStatus: f.status,
      consentAccepted: Boolean(f.consent_accepted_at),
      accountStatus,
      symbol: ev.symbol,
      symbolAllowlist: f.symbol_allowlist ?? strategy.symbol_allowlist,
      symbolBlocklist: f.symbol_blocklist ?? strategy.symbol_blocklist,
      maxOpenTrades: f.max_open_trades,
      maxDrawdownPercent: f.max_drawdown_percent === null ? null : Number(f.max_drawdown_percent),
    });
    if (!elig.eligible) {
      await supabase.from("copy_execution_logs").insert({ ...baseLog, action: "SKIPPED", status: "SKIPPED", error_code: COPY_ERROR.FOLLOWER_NOT_ELIGIBLE, error_message: elig.reason });
      summary.skipped++;
      continue;
    }

    const followerSnap = await getSnapshot(f.follower_account_id);
    const lot = calculateFollowerLot({
      masterLot,
      masterEquity: masterSnap?.equity ?? null,
      masterBalance: masterSnap?.balance ?? null,
      followerEquity: followerSnap?.equity ?? null,
      followerBalance: followerSnap?.balance ?? null,
      scalingMode: (f.scaling_mode ?? strategy.default_scaling_mode) as ScalingMode,
      riskMultiplier: f.risk_multiplier === null ? Number(strategy.risk_multiplier) : Number(f.risk_multiplier),
      fixedLot: f.fixed_lot === null ? null : Number(f.fixed_lot),
      maxLot: f.max_lot === null ? (strategy.max_follower_lot === null ? null : Number(strategy.max_follower_lot)) : Number(f.max_lot),
    });
    if (lot.lot <= 0) {
      await supabase.from("copy_execution_logs").insert({ ...baseLog, action: "SKIPPED", status: "SKIPPED", error_code: COPY_ERROR.COPY_INVALID_LOT, error_message: lot.reason, calculated_lot: 0 });
      summary.skipped++;
      continue;
    }

    // ── Place the live order. Failures are logged, never faked; one follower's
    //    failure does not abort the others. ──
    summary.attempted++;
    try {
      const result = await adapter.openTrade({
        accountId: f.follower_account_id,
        symbol: ev.symbol,
        side: ev.side === "SELL" ? "SELL" : "BUY",
        volume: lot.lot,
        comment: `aurix:${strategy.id.slice(0, 8)}`,
      });
      await supabase.from("copy_execution_logs").insert({
        ...baseLog,
        action: "OPEN",
        status: "SUCCESS",
        calculated_lot: lot.lot,
        executed_lot: result.executedVolume ?? lot.lot,
        broker_order_id: result.brokerOrderId ?? null,
        raw_response: result.rawResponse ?? null,
      });
      await logBrokerOperation({
        accountId: f.follower_account_id,
        userId: f.trader_id,
        operation: "OPEN_TRADE",
        status: "SUCCESS",
        safeMetadata: { strategyId: strategy.id, symbol: ev.symbol, lot: lot.lot },
      });
      summary.success++;
    } catch (err) {
      const code = err instanceof BrokerExecutionError ? err.code : COPY_ERROR.COPY_PROVIDER_ERROR;
      const message = (err instanceof Error ? err.message : "Broker execution failed").slice(0, 400);
      await supabase.from("copy_execution_logs").insert({
        ...baseLog,
        action: "OPEN",
        status: "FAILED",
        calculated_lot: lot.lot,
        error_code: code,
        error_message: message,
      });
      await logBrokerOperation({
        accountId: f.follower_account_id,
        userId: f.trader_id,
        operation: "OPEN_TRADE",
        status: "FAILED",
        errorCode: code,
        errorMessage: message,
        safeMetadata: { strategyId: strategy.id, symbol: ev.symbol },
      });
      summary.failed++;
    }
  }

  return summary;
}

/** Admin-triggered retry of a FAILED live log. Re-runs the gated execution path. */
export async function retryCopyExecution(logId: string, actorUserId: string | null): Promise<ExecSummary> {
  const supabase = createAdminClient();
  const { data: log } = await supabase
    .from("copy_execution_logs")
    .select("id, master_event_id, mode, status")
    .eq("id", logId)
    .maybeSingle();
  if (!log) throw new CopyError(COPY_ERROR.COPY_DUPLICATE_EVENT, "Log not found", 404);
  if (log.mode !== "LIVE" || log.status !== "FAILED") {
    throw new CopyError(COPY_ERROR.VALIDATION_ERROR, "Only failed live executions can be retried.", 400);
  }
  // Re-runs all gates; today this surfaces COPY_EXECUTION_NOT_CONFIGURED.
  return executeCopyForEvent(log.master_event_id, actorUserId);
}

// ── Trader-facing (scoped to the authenticated trader) ───────────────────────

export interface TraderStrategyDto {
  id: string;
  name: string;
  description: string | null;
  mode: CopyStrategyDto["mode"];
  riskMultiplier: number;
  defaultScalingMode: ScalingMode;
}

export async function listActiveStrategiesForTrader(): Promise<TraderStrategyDto[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("copy_strategies")
    .select("id, name, description, mode, risk_multiplier, default_scaling_mode")
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    mode: s.mode,
    riskMultiplier: Number(s.risk_multiplier),
    defaultScalingMode: s.default_scaling_mode as ScalingMode,
  }));
}

export async function listMySubscriptions(traderUserId: string): Promise<CopyFollowerDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("copy_strategy_followers")
    .select(
      "id, strategy_id, follower_account_id, trader_id, status, scaling_mode, risk_multiplier, fixed_lot, max_lot, consent_accepted_at, created_at, copy_strategies(name), trading_accounts!follower_account_id(account_name)",
    )
    .eq("trader_id", traderUserId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Failed to fetch subscriptions: ${error.message}`);

  return (data ?? []).map((r) => {
    const strat = (r as { copy_strategies?: { name?: string } }).copy_strategies;
    const acct = (r as { trading_accounts?: { account_name?: string } }).trading_accounts;
    return {
      id: r.id,
      strategyId: r.strategy_id,
      strategyName: strat?.name ?? null,
      followerAccountId: r.follower_account_id,
      followerAccountName: acct?.account_name ?? null,
      traderId: r.trader_id,
      status: r.status,
      scalingMode: r.scaling_mode,
      riskMultiplier: r.risk_multiplier === null ? null : Number(r.risk_multiplier),
      fixedLot: r.fixed_lot === null ? null : Number(r.fixed_lot),
      maxLot: r.max_lot === null ? null : Number(r.max_lot),
      consentAcceptedAt: r.consent_accepted_at,
      createdAt: r.created_at,
    };
  });
}

export async function followStrategy(
  traderUserId: string,
  strategyId: string,
  input: {
    followerAccountId: string;
    scalingMode?: ScalingMode;
    riskMultiplier?: number;
    fixedLot?: number;
    maxLot?: number;
  },
): Promise<CopyFollowerDto> {
  const supabase = createAdminClient();

  // Strategy must exist and be ACTIVE.
  const { data: strat } = await supabase
    .from("copy_strategies")
    .select("id, status")
    .eq("id", strategyId)
    .maybeSingle();
  if (!strat) throw new CopyError(COPY_ERROR.COPY_STRATEGY_NOT_FOUND, "Strategy not found", 404);
  if (strat.status !== "ACTIVE") throw new CopyError(COPY_ERROR.COPY_STRATEGY_NOT_FOUND, "Strategy is not active", 400);

  // Follower account must belong to this trader.
  const { data: account } = await supabase
    .from("trading_accounts")
    .select("id, user_id")
    .eq("id", input.followerAccountId)
    .eq("user_id", traderUserId)
    .maybeSingle();
  if (!account) throw new CopyError(COPY_ERROR.FORBIDDEN, "Account not found or not yours", 403);

  const { data, error } = await supabase
    .from("copy_strategy_followers")
    .upsert(
      {
        strategy_id: strategyId,
        follower_account_id: input.followerAccountId,
        trader_id: traderUserId,
        status: "ACTIVE",
        scaling_mode: input.scalingMode ?? null,
        risk_multiplier: input.riskMultiplier ?? null,
        fixed_lot: input.fixedLot ?? null,
        max_lot: input.maxLot ?? null,
        consent_accepted_at: new Date().toISOString(),
        paused_at: null,
      },
      { onConflict: "strategy_id,follower_account_id" },
    )
    .select(
      "id, strategy_id, follower_account_id, trader_id, status, scaling_mode, risk_multiplier, fixed_lot, max_lot, consent_accepted_at, created_at",
    )
    .single();
  if (error || !data) throw new Error(`Failed to follow strategy: ${error?.message}`);

  await writeAuditLog({
    actorUserId: traderUserId,
    action: "COPY_FOLLOWER_CHANGED",
    entityType: "copy_strategy_follower",
    entityId: data.id,
    metadata: { strategyId, action: "FOLLOW" },
  });

  return {
    id: data.id,
    strategyId: data.strategy_id,
    strategyName: null,
    followerAccountId: data.follower_account_id,
    followerAccountName: null,
    traderId: data.trader_id,
    status: data.status,
    scalingMode: data.scaling_mode,
    riskMultiplier: data.risk_multiplier === null ? null : Number(data.risk_multiplier),
    fixedLot: data.fixed_lot === null ? null : Number(data.fixed_lot),
    maxLot: data.max_lot === null ? null : Number(data.max_lot),
    consentAcceptedAt: data.consent_accepted_at,
    createdAt: data.created_at,
  };
}

export async function updateMySubscription(
  traderUserId: string,
  subscriptionId: string,
  patch: { status?: "ACTIVE" | "PAUSED" | "REVOKED"; riskMultiplier?: number; maxLot?: number | null; scalingMode?: ScalingMode },
): Promise<void> {
  const supabase = createAdminClient();
  const { data: sub } = await supabase
    .from("copy_strategy_followers")
    .select("id, trader_id")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) throw new CopyError(COPY_ERROR.FOLLOWER_NOT_FOUND, "Subscription not found", 404);
  if (sub.trader_id !== traderUserId) throw new CopyError(COPY_ERROR.FORBIDDEN, "Not your subscription", 403);

  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    row.status = patch.status;
    row.paused_at = patch.status === "PAUSED" ? new Date().toISOString() : null;
  }
  if (patch.riskMultiplier !== undefined) row.risk_multiplier = patch.riskMultiplier;
  if (patch.maxLot !== undefined) row.max_lot = patch.maxLot;
  if (patch.scalingMode !== undefined) row.scaling_mode = patch.scalingMode;

  const { error } = await supabase.from("copy_strategy_followers").update(row).eq("id", subscriptionId);
  if (error) throw new Error(`Failed to update subscription: ${error.message}`);

  await writeAuditLog({
    actorUserId: traderUserId,
    action: "COPY_FOLLOWER_CHANGED",
    entityType: "copy_strategy_follower",
    entityId: subscriptionId,
    metadata: { ...patch },
  });
}

export async function listTraderCopyLogs(traderUserId: string): Promise<CopyLogDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("copy_execution_logs")
    .select(LOG_COLS)
    .eq("trader_id", traderUserId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`Failed to fetch logs: ${error.message}`);
  return (data ?? []).map(mapLog);
}
