import { createAdminClient } from "../src/lib/supabase/admin";
import { enqueueJob } from "../src/lib/services/backgroundJobService";
import { runWorkerOnce } from "../src/lib/workers/jobProcessor";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Position = {
  id: string | number; type: string; symbol: string; volume: number; openPrice: number;
  currentPrice?: number; stopLoss?: number; takeProfit?: number;
  time?: Date | string; updateTime?: Date | string;
};
type LiveStrategy = {
  id: string; master_account_id: string;
  trading_accounts: { provider_account_id: string | null } | null;
};
type StreamHandle = { close(): Promise<void> };

const pollMs = Math.max(1_000, Number.parseInt(process.env.WSA_COPY_POLL_MS ?? "3000", 10) || 3_000);
const workerId = `wsa-copy-${process.pid}`;
const streams = new Map<string, StreamHandle>();
let stopping = false;

function iso(value?: Date | string) {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function changed(previous: Position, current: Position) {
  return Number(previous.volume) !== Number(current.volume)
    || Number(previous.stopLoss ?? 0) !== Number(current.stopLoss ?? 0)
    || Number(previous.takeProfit ?? 0) !== Number(current.takeProfit ?? 0);
}

async function persistEvent(strategy: LiveStrategy, eventType: "OPEN" | "MODIFY" | "CLOSE", position: Position, previous?: Position) {
  const supabase = createAdminClient();
  const positionId = String(position.id);
  const eventTime = iso(position.updateTime ?? position.time);
  const fingerprint = eventType === "MODIFY"
    ? `${eventTime}:${position.volume}:${position.stopLoss ?? ""}:${position.takeProfit ?? ""}`
    : eventType;
  const dedupeKey = `${strategy.id}:${positionId}:${fingerprint}`;
  const { data, error } = await supabase.from("copy_master_events").insert({
    strategy_id: strategy.id,
    master_account_id: strategy.master_account_id,
    event_type: eventType,
    master_trade_id: positionId,
    symbol: position.symbol,
    side: position.type === "POSITION_TYPE_SELL" ? "SELL" : "BUY",
    volume: Number(position.volume ?? 0),
    previous_volume: previous ? Number(previous.volume ?? 0) : null,
    open_price: Number(position.openPrice ?? 0),
    close_price: eventType === "CLOSE" ? Number(position.currentPrice ?? 0) : null,
    stop_loss: position.stopLoss ?? null,
    take_profit: position.takeProfit ?? null,
    event_time: eventTime,
    dedupe_key: dedupeKey,
    source_sequence: fingerprint,
    source: "WSA_STREAM",
    raw_payload: { source: "METAAPI_STREAM", eventType },
  }).select("id").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return;
    throw new Error(`Master event could not be stored: ${error.message}`);
  }
  await enqueueJob({
    type: "EXECUTE_COPY_EVENT",
    payload: { masterEventId: data.id },
    uniqueKey: `EXECUTE_COPY_EVENT:${data.id}`,
    priority: 200,
  });
}

async function openStrategyStream(strategy: LiveStrategy): Promise<StreamHandle> {
  const providerAccountId = strategy.trading_accounts?.provider_account_id;
  if (!providerAccountId) throw new Error("Master account has no MetaApi provider account.");
  const sdk = await import("metaapi.cloud-sdk/node") as unknown as {
    default: new (authToken: string) => {
      metatraderAccountApi: { getAccount(id: string): Promise<any> }; close(): void;
    };
    SynchronizationListener: new () => any;
  };
  const api = new sdk.default(process.env.METAAPI_TOKEN!);
  const account = await api.metatraderAccountApi.getAccount(providerAccountId);
  if (account.state !== "DEPLOYED") {
    await account.deploy();
    await account.waitDeployed(120, 1_000);
  }
  await account.waitConnected(120, 1_000);
  const connection = account.getStreamingConnection();
  const positions = new Map<string, Position>();
  let ready = false;

  class MasterListener extends sdk.SynchronizationListener {
    async onPositionsReplaced(_instanceIndex: string, current: Position[]) {
      positions.clear();
      for (const position of current) positions.set(String(position.id), position);
    }
    async onPositionUpdated(_instanceIndex: string, position: Position) {
      const key = String(position.id);
      const previous = positions.get(key);
      positions.set(key, position);
      if (!ready) return;
      if (!previous) await persistEvent(strategy, "OPEN", position);
      else if (changed(previous, position)) await persistEvent(strategy, "MODIFY", position, previous);
    }
    async onPositionRemoved(_instanceIndex: string, positionId: string) {
      const previous = positions.get(String(positionId));
      positions.delete(String(positionId));
      if (ready && previous) await persistEvent(strategy, "CLOSE", previous);
    }
  }
  const listener = new MasterListener();
  connection.addSynchronizationListener(listener);
  await connection.connect();
  await connection.waitSynchronized({ timeoutInSeconds: 120 });
  for (const position of (connection.terminalState.positions ?? []) as Position[]) {
    positions.set(String(position.id), position);
  }
  ready = true;
  await createAdminClient().from("copy_strategies").update({
    engine_status: "LIVE", engine_error: null, engine_heartbeat_at: new Date().toISOString(),
  }).eq("id", strategy.id);
  return {
    async close() {
      ready = false;
      connection.removeSynchronizationListener(listener);
      await connection.close();
      api.close();
    },
  };
}

async function reconcileStreams() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("copy_strategies")
    .select("id, master_account_id, trading_accounts!master_account_id(provider_account_id)")
    .eq("status", "ACTIVE").eq("live_enabled", true).in("engine_status", ["LIVE", "STARTING", "ERROR"]).limit(500);
  if (error) throw new Error(`Live strategies could not be loaded: ${error.message}`);
  const active = new Map((data ?? []).map((entry) => [entry.id, entry as unknown as LiveStrategy]));
  for (const [strategyId, handle] of streams) {
    if (!active.has(strategyId)) {
      await handle.close();
      streams.delete(strategyId);
    }
  }
  for (const strategy of active.values()) {
    if (streams.has(strategy.id)) {
      await supabase.from("copy_strategies").update({ engine_heartbeat_at: new Date().toISOString() }).eq("id", strategy.id);
      continue;
    }
    try {
      streams.set(strategy.id, await openStrategyStream(strategy));
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Master stream failed").slice(0, 400);
      await supabase.from("copy_strategies").update({ engine_status: "ERROR", engine_error: message }).eq("id", strategy.id);
    }
  }
}

async function shutdown() {
  stopping = true;
  await Promise.allSettled([...streams.values()].map((stream) => stream.close()));
  streams.clear();
}

async function main() {
  if (!process.env.METAAPI_TOKEN || process.env.WSA_COPY_ENGINE_ENABLED !== "true") {
    throw new Error("WSA copy worker is disabled or METAAPI_TOKEN is missing.");
  }
  if (process.env.BROKER_EXECUTION_ENABLED !== "true") {
    throw new Error("BROKER_EXECUTION_ENABLED must be true before the live WSA worker can start.");
  }
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  while (!stopping) {
    await reconcileStreams();
    await runWorkerOnce({ workerId, limit: 25, types: ["EXECUTE_COPY_EVENT", "CLOSE_COPY_STRATEGY", "RETRY_COPY_LOG"] });
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main().catch(async (error) => {
  await shutdown();
  console.error(error instanceof Error ? error.message : "WSA copy worker failed.");
  process.exitCode = 1;
});
