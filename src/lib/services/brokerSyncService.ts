if (typeof window !== 'undefined') {
  throw new Error('[aurix] brokerSyncService is server-only.');
}

import { createAdminClient } from '@/lib/supabase/admin';
import { getDecryptedCredentials, type BrokerCredentialPayload } from '@/lib/services/brokerCredentialService';
import { writeAuditLog } from '@/lib/services/auditService';
import { evaluateAndPersistRiskEvents } from '@/lib/services/riskEvaluationService';
import { createNotification } from '@/lib/services/notificationService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncSummary {
  accountId: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
  snapshotInserted: boolean;
  tradesUpserted: number;
  error?: string;
}

export interface TradeRefreshSummary {
  accountId: string;
  providerAccountId: string;
  snapshotInserted: boolean;
  openPositions: number;
  tradesUpserted: number;
  balance: number;
  equity: number;
  currency: string;
  error?: string;
}

// 50 s gives us headroom under the default Next.js 60 s route timeout.
// MetaAPI deploy + connect can easily take 2–5 minutes — we return "still pending"
// and the caller can re-trigger via the sync-status endpoint.
const SYNC_TIMEOUT_MS = 50_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeMessage(msg: string, creds: BrokerCredentialPayload): string {
  let s = msg;
  if (creds.login) s = s.split(creds.login).join('[redacted]');
  if (creds.password) s = s.split(creds.password).join('[redacted]');
  if (creds.server) s = s.split(creds.server).join('[redacted]');
  if (msg.includes('high reliability') && msg.includes('top up')) {
    return (
      'MetaAPI rejected regular-reliability provisioning. ' +
      'Your MetaAPI account may have no available slots. ' +
      'Delete unused accounts at app.metaapi.cloud and retry.'
    );
  }
  return s.slice(0, 500);
}

async function markFailed(
  supabase: ReturnType<typeof createAdminClient>,
  accountId: string,
  actorUserId: string | null,
  message: string,
) {
  await supabase
    .from('trading_accounts')
    .update({ status: 'DISCONNECTED', sync_error: message.slice(0, 500) })
    .eq('id', accountId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core MetaAPI sync — single SDK session, all data in one connection
// ─────────────────────────────────────────────────────────────────────────────

async function runMetaApiSync(params: {
  token: string;
  accountId: string;
  supabase: ReturnType<typeof createAdminClient>;
  actorUserId: string | null;
  credentials: BrokerCredentialPayload;
  platform: 'mt4' | 'mt5';
  existingProviderAccountId: string | null;
}): Promise<SyncSummary> {
  const { token, accountId, supabase, actorUserId, credentials, platform, existingProviderAccountId } = params;

  // Dynamic import avoids webpack bundling the browser-ESM entry point of metaapi.cloud-sdk.
  // serverExternalPackages in next.config.ts makes Node use require() → dist/index.js (no window refs).
  const MetaApi = (await import('metaapi.cloud-sdk')).default as any;
  const api = new MetaApi(token);
  let connection: any = null;

  try {
    // ── 1. Get or create MetaAPI account ───────────────────────────────────
    let metaAccount: any;

    if (existingProviderAccountId) {
      console.log('[METAAPI_CREATE_OR_REUSE_START]', { providerAccountId: existingProviderAccountId });
      metaAccount = await api.metatraderAccountApi.getAccount(existingProviderAccountId);
      console.log('[METAAPI_ACCOUNT_STATE]', {
        id: metaAccount.id,
        state: metaAccount.state,
        connectionStatus: metaAccount.connectionStatus,
      });
    } else {
      console.log('[METAAPI_CREATE_OR_REUSE_START]', { providerAccountId: null });
      console.log('[MetaAPI_CREATE_PAYLOAD_SAFE]', { reliability: 'regular', platform });

      metaAccount = await api.metatraderAccountApi.createAccount({
        login: credentials.login,
        password: credentials.password,
        server: credentials.server,
        platform,
        // `name` is the label shown in MetaAPI dashboard — not a DB column
        name: credentials.brokerName
          ? credentials.brokerName
          : `Account-${accountId.slice(0, 8)}`,
        magic: 0,
        type: 'cloud',
        reliability: 'regular',
      });

      console.log('[MetaAPI_CREATE_PAYLOAD_SAFE] Account created', {
        id: metaAccount.id,
        state: metaAccount.state,
        reliability: metaAccount.reliability,
      });

      // ── 2. Save provider_account_id IMMEDIATELY — before deploy/connect ──
      // This prevents creating a duplicate MetaAPI account if the request times out.
      await supabase
        .from('trading_accounts')
        .update({
          provider_account_id: metaAccount.id,
          provider: credentials.provider,
          sync_error: null,
        })
        .eq('id', accountId);
    }

    // ── 3. Deploy if not already deployed ─────────────────────────────────
    if (metaAccount.state !== 'DEPLOYED') {
      console.log('[MetaAPI_CREATE_PAYLOAD_SAFE] Deploying', { state: metaAccount.state });
      await metaAccount.deploy();
      await metaAccount.waitDeployed(120, 1000);
    }

    // ── 4. Wait for broker connection ──────────────────────────────────────
    await metaAccount.waitConnected(60, 1000);

    console.log('[METAAPI_ACCOUNT_STATE]', {
      id: metaAccount.id,
      state: metaAccount.state,
      connectionStatus: metaAccount.connectionStatus,
    });

    // ── 5. Open RPC connection and fetch all data in one session ──────────
    connection = metaAccount.getRPCConnection();
    await connection.connect();
    await connection.waitSynchronized(60);

    const [info, positions] = await Promise.all([
      connection.getAccountInformation(),
      connection.getPositions(),
    ]);

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dealsResult = await connection.getDealsByTimeRange(since, new Date());
    const deals: any[] = Array.isArray(dealsResult) ? dealsResult : (dealsResult?.deals ?? []);

    const currency: string = info?.currency ?? 'USD';
    const balance: number = info?.balance ?? 0;
    const equity: number = info?.equity ?? 0;

    // ── 6. Insert account snapshot ─────────────────────────────────────────
    await supabase.from('account_snapshots').insert({
      trading_account_id: accountId,
      balance,
      equity,
      floating_pnl: equity - balance,
      drawdown_percent: balance > 0 ? Math.max(0, ((balance - equity) / balance) * 100) : 0,
    });

    // ── 7. Upsert trades ───────────────────────────────────────────────────
    const openRows = (positions as any[]).map((p) => ({
      trading_account_id: accountId,
      external_trade_id: String(p.id),
      symbol: p.symbol ?? '',
      side: p.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
      status: 'OPEN',
      volume: p.volume ?? 0,
      open_price: p.openPrice ?? 0,
      close_price: null,
      profit: p.profit ?? 0,
      currency,
      opened_at: new Date(p.openTime).toISOString(),
      closed_at: null,
    }));

    const closedRows = deals
      .filter((d) => d.entryType === 'DEAL_ENTRY_OUT')
      .map((d) => ({
        trading_account_id: accountId,
        external_trade_id: String(d.positionId ?? d.id),
        symbol: d.symbol ?? '',
        side: d.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL',
        status: 'CLOSED',
        volume: d.volume ?? 0,
        open_price: 0,
        close_price: d.price ?? null,
        profit: d.profit ?? 0,
        currency,
        opened_at: new Date(d.time).toISOString(),
        closed_at: new Date(d.time).toISOString(),
      }));

    const allTrades = [...openRows, ...closedRows];
    let tradesUpserted = 0;
    if (allTrades.length > 0) {
      const { data: upserted } = await supabase
        .from('trades')
        .upsert(allTrades, { onConflict: 'trading_account_id,external_trade_id' })
        .select('id');
      tradesUpserted = upserted?.length ?? 0;
    }

    // ── 8. Mark CONNECTED ──────────────────────────────────────────────────
    await supabase
      .from('trading_accounts')
      .update({
        status: 'CONNECTED',
        last_synced_at: new Date().toISOString(),
        sync_error: null,
        provider: credentials.provider,
        provider_account_id: metaAccount.id,
      })
      .eq('id', accountId);

    console.log('[SYNC_SUCCESS]', { tradingAccountId: accountId, providerAccountId: metaAccount.id });

    void writeAuditLog({
      actorUserId,
      action: 'ACCOUNT_SYNC_COMPLETED',
      entityType: 'trading_account',
      entityId: accountId,
      metadata: { provider: credentials.provider, tradesUpserted, snapshotInserted: true },
    });

    return { accountId, status: 'CONNECTED', snapshotInserted: true, tradesUpserted };

  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    const safeMsg = sanitizeMessage(rawMsg, credentials);
    console.error('[SYNC_ERROR]', {
      tradingAccountId: accountId,
      message: rawMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
    await markFailed(supabase, accountId, actorUserId, safeMsg);
    return { accountId, status: 'DISCONNECTED', snapshotInserted: false, tradesUpserted: 0, error: safeMsg };

  } finally {
    if (connection) { try { await connection.close(); } catch { /* ignore */ } }
    try { api.close(); } catch { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: sync one account
// ─────────────────────────────────────────────────────────────────────────────

export async function syncTradingAccount(
  accountId: string,
  actorUserId: string | null,
): Promise<SyncSummary> {
  const supabase = createAdminClient();

  console.log('[SYNC_START]', { tradingAccountId: accountId });

  // 1. Load account — do NOT select a `name` column (it may not exist)
  const { data: account, error: loadErr } = await supabase
    .from('trading_accounts')
    .select('id, broker_name, status, provider_account_id, user_id')
    .eq('id', accountId)
    .single();

  if (loadErr || !account) {
    console.error('[SYNC_ERROR]', { tradingAccountId: accountId, message: 'Account not found' });
    return { accountId, status: 'DISCONNECTED', snapshotInserted: false, tradesUpserted: 0, error: 'Account not found.' };
  }

  console.log('[DB_ACCOUNT_BEFORE_SYNC]', {
    id: account.id,
    status: account.status,
    provider_account_id: account.provider_account_id,
  });

  // 2. Load and decrypt credentials (never logged)
  const credentials = await getDecryptedCredentials(accountId);
  if (!credentials) {
    return { accountId, status: 'PENDING', snapshotInserted: false, tradesUpserted: 0, error: 'No broker credentials stored for this account.' };
  }

  // 3. Resolve platform — use stored value, fall back to MT5 for modern brokers
  // Old credentials without `platform` field will have undefined here; default to mt5.
  const platform: 'mt4' | 'mt5' = credentials.platform ?? 'mt5';

  // 4. Check MetaAPI token
  const token = process.env.METAAPI_TOKEN;
  if (!token) {
    return { accountId, status: 'DISCONNECTED', snapshotInserted: false, tradesUpserted: 0, error: 'METAAPI_TOKEN is not configured.' };
  }

  // 5. Set SYNCING in DB
  await supabase
    .from('trading_accounts')
    .update({ status: 'SYNCING', sync_error: null })
    .eq('id', accountId);

  void writeAuditLog({
    actorUserId,
    action: 'ACCOUNT_SYNC_TRIGGERED',
    entityType: 'trading_account',
    entityId: accountId,
    metadata: { provider: credentials.provider, platform },
  });

  // 6. Race MetaAPI sync against a hard timeout
  const timeoutPromise = new Promise<'__timeout__'>((resolve) =>
    setTimeout(() => resolve('__timeout__'), SYNC_TIMEOUT_MS)
  );

  const syncPromise = runMetaApiSync({
    token,
    accountId,
    supabase,
    actorUserId,
    credentials,
    platform,
    existingProviderAccountId: account.provider_account_id ?? null,
  });

  const result = await Promise.race([syncPromise, timeoutPromise]);

  if (result === '__timeout__') {
    const msg =
      'MetaAPI connection still pending (50 s timeout). ' +
      'The account may still be deploying. Use "Check status" to poll MetaAPI for the current state.';
    // Leave status as SYNCING — it may still complete in the background
    await supabase
      .from('trading_accounts')
      .update({ sync_error: msg })
      .eq('id', accountId);
    console.log('[SYNC_TIMEOUT]', { tradingAccountId: accountId });
    return { accountId, status: 'PENDING', snapshotInserted: false, tradesUpserted: 0, error: msg };
  }

  // ── Post-sync: risk evaluation and notifications ──────────────────────────
  if (result.status === 'CONNECTED') {
    // Fire-and-forget — never let this fail the sync response
    void evaluateAndPersistRiskEvents(accountId, actorUserId).catch((err) =>
      console.error('[SYNC_RISK_EVAL_ERROR]', { accountId, err })
    );

    // account.status is the pre-sync value — intentionally stale to detect first-time connections
    if (account.status !== 'CONNECTED') {
      void createNotification({
        userId: account.user_id,
        accountId,
        type: 'SYNC_SUCCESS',
        title: 'Account connected',
        message: `${account.broker_name} account successfully connected and synced.`,
      }).catch(() => {/* ignore notification errors */});
    }
  }

  if (result.status === 'DISCONNECTED' && result.error) {
    void createNotification({
      userId: account.user_id,
      accountId,
      type: 'SYNC_FAILURE',
      title: 'Account sync failed',
      message: result.error.slice(0, 200),
    }).catch(() => {/* ignore */});
    void writeAuditLog({
      actorUserId,
      action: 'ACCOUNT_SYNC_FAILED',
      entityType: 'trading_account',
      entityId: accountId,
      metadata: { error: result.error.slice(0, 200) },
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: lightweight trade refresh — uses existing provider_account_id only.
// No account creation. No credentials required.
// Intended for trader-triggered "Sync Trades" button.
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshAccountTrades(
  accountId: string,
  actorUserId: string | null,
): Promise<TradeRefreshSummary> {
  const supabase = createAdminClient();

  console.log('[REFRESH_START]', { tradingAccountId: accountId });

  const { data: account, error: loadErr } = await supabase
    .from('trading_accounts')
    .select('id, status, provider_account_id, user_id')
    .eq('id', accountId)
    .single();

  if (loadErr || !account) {
    return { accountId, providerAccountId: '', snapshotInserted: false, openPositions: 0, tradesUpserted: 0, balance: 0, equity: 0, currency: 'USD', error: 'Account not found.' };
  }

  if (!account.provider_account_id) {
    return { accountId, providerAccountId: '', snapshotInserted: false, openPositions: 0, tradesUpserted: 0, balance: 0, equity: 0, currency: 'USD', error: 'Account has not been synced by an admin yet. No MetaAPI account ID stored.' };
  }

  const token = process.env.METAAPI_TOKEN;
  if (!token) {
    return { accountId, providerAccountId: account.provider_account_id, snapshotInserted: false, openPositions: 0, tradesUpserted: 0, balance: 0, equity: 0, currency: 'USD', error: 'METAAPI_TOKEN is not configured.' };
  }

  const timeoutPromise = new Promise<'__timeout__'>((resolve) =>
    setTimeout(() => resolve('__timeout__'), SYNC_TIMEOUT_MS)
  );

  const refreshPromise = (async (): Promise<TradeRefreshSummary> => {
    const MetaApi = (await import('metaapi.cloud-sdk')).default as any;
    const api = new MetaApi(token);
    let connection: any = null;

    try {
      const metaAccount = await api.metatraderAccountApi.getAccount(account.provider_account_id);

      console.log('[METAAPI_ACCOUNT_STATE]', {
        id: metaAccount.id,
        state: metaAccount.state,
        connectionStatus: metaAccount.connectionStatus,
      });

      if (metaAccount.state !== 'DEPLOYED') {
        await metaAccount.deploy();
        await metaAccount.waitDeployed(90, 1000);
      }

      await metaAccount.waitConnected(60, 1000);

      connection = metaAccount.getRPCConnection();
      await connection.connect();
      await connection.waitSynchronized(60);

      // Fetch account info and positions sequentially so we can log each step.
      const info = await connection.getAccountInformation();

      console.log('[REFRESH_ACCOUNT_INFO]', {
        tradingAccountId: accountId,
        balance: info?.balance,
        equity: info?.equity,
        currency: info?.currency,
        margin: info?.margin,
        freeMargin: info?.freeMargin,
        leverage: info?.leverage,
        server: info?.server,
        brokerName: info?.brokerName,
      });

      const rawPositions = await connection.getPositions();

      console.log('[REFRESH_RAW_POSITIONS]', {
        tradingAccountId: accountId,
        isArray: Array.isArray(rawPositions),
        type: typeof rawPositions,
        count: Array.isArray(rawPositions) ? rawPositions.length : 'N/A',
        // Log first position fields (no credentials in position data)
        first: Array.isArray(rawPositions) && rawPositions.length > 0
          ? {
              id: rawPositions[0].id,
              symbol: rawPositions[0].symbol,
              type: rawPositions[0].type,
              volume: rawPositions[0].volume,
              openPrice: rawPositions[0].openPrice,
              profit: rawPositions[0].profit,
            }
          : null,
      });

      // Guard: MetaAPI may return null / undefined / non-array on empty terminal
      const positions: any[] = Array.isArray(rawPositions) ? rawPositions : [];

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const dealsResult = await connection.getDealsByTimeRange(since, new Date());

      // getDealsByTimeRange returns { deals: [] } in some SDK versions, plain array in others
      const deals: any[] = Array.isArray(dealsResult)
        ? dealsResult
        : Array.isArray(dealsResult?.deals)
          ? dealsResult.deals
          : [];

      const outDeals = deals.filter((d: any) => d.entryType === 'DEAL_ENTRY_OUT');

      console.log('[REFRESH_RAW_DEALS]', {
        tradingAccountId: accountId,
        resultType: typeof dealsResult,
        isArray: Array.isArray(dealsResult),
        hasDealsKey: dealsResult !== null && typeof dealsResult === 'object' && 'deals' in dealsResult,
        totalDeals: deals.length,
        outDeals: outDeals.length,
        firstDeal: deals.length > 0
          ? {
              id: deals[0].id,
              symbol: deals[0].symbol,
              type: deals[0].type,
              entryType: deals[0].entryType,
              volume: deals[0].volume,
              profit: deals[0].profit,
            }
          : null,
      });

      const currency: string = info?.currency ?? 'USD';
      const balance: number = info?.balance ?? 0;
      const equity: number = info?.equity ?? 0;

      // Insert snapshot
      await supabase.from('account_snapshots').insert({
        trading_account_id: accountId,
        balance,
        equity,
        floating_pnl: equity - balance,
        drawdown_percent: balance > 0 ? Math.max(0, ((balance - equity) / balance) * 100) : 0,
      });

      // Build trade rows
      const openRows = positions.map((p: any) => ({
        trading_account_id: accountId,
        external_trade_id: String(p.id),
        symbol: p.symbol ?? '',
        side: p.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
        status: 'OPEN',
        volume: p.volume ?? 0,
        open_price: p.openPrice ?? 0,
        close_price: null,
        profit: p.profit ?? 0,
        currency,
        opened_at: p.openTime ? new Date(p.openTime).toISOString() : new Date().toISOString(),
        closed_at: null,
      }));

      const closedRows = outDeals.map((d: any) => ({
        trading_account_id: accountId,
        external_trade_id: String(d.positionId ?? d.id),
        symbol: d.symbol ?? '',
        side: d.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL',
        status: 'CLOSED',
        volume: d.volume ?? 0,
        open_price: 0,
        close_price: d.price ?? null,
        profit: d.profit ?? 0,
        currency,
        opened_at: d.time ? new Date(d.time).toISOString() : new Date().toISOString(),
        closed_at: d.time ? new Date(d.time).toISOString() : new Date().toISOString(),
      }));

      const allTrades = [...openRows, ...closedRows];

      console.log('[REFRESH_UPSERT_PLAN]', {
        tradingAccountId: accountId,
        openRows: openRows.length,
        closedRows: closedRows.length,
        totalRows: allTrades.length,
      });

      let tradesUpserted = 0;
      if (allTrades.length > 0) {
        const { data: upserted, error: upsertErr } = await supabase
          .from('trades')
          .upsert(allTrades, { onConflict: 'trading_account_id,external_trade_id' })
          .select('id');
        if (upsertErr) {
          console.error('[REFRESH_UPSERT_ERROR]', { tradingAccountId: accountId, message: upsertErr.message });
        }
        tradesUpserted = upserted?.length ?? 0;
        console.log('[REFRESH_UPSERT_RESULT]', { tradingAccountId: accountId, tradesUpserted });
      }

      // Update last_synced_at (keep status as-is — admin sets CONNECTED)
      await supabase
        .from('trading_accounts')
        .update({ last_synced_at: new Date().toISOString(), sync_error: null })
        .eq('id', accountId);

      console.log('[REFRESH_SUCCESS]', { tradingAccountId: accountId, openPositions: positions.length, tradesUpserted });

      void writeAuditLog({
        actorUserId,
        action: 'ACCOUNT_SYNC_COMPLETED',
        entityType: 'trading_account',
        entityId: accountId,
        metadata: { source: 'trader-refresh', tradesUpserted, openPositions: positions.length },
      });

      return { accountId, providerAccountId: metaAccount.id, snapshotInserted: true, openPositions: positions.length, tradesUpserted, balance, equity, currency };

    } catch (error) {
      const msg = (error instanceof Error ? error.message : String(error)).slice(0, 400);
      console.error('[REFRESH_ERROR]', { tradingAccountId: accountId, message: msg });
      await supabase.from('trading_accounts').update({ sync_error: msg }).eq('id', accountId);
      return { accountId, providerAccountId: account.provider_account_id, snapshotInserted: false, openPositions: 0, tradesUpserted: 0, balance: 0, equity: 0, currency: 'USD', error: msg };

    } finally {
      if (connection) { try { await connection.close(); } catch { /* ignore */ } }
      try { api.close(); } catch { /* ignore */ }
    }
  })();

  const result = await Promise.race([refreshPromise, timeoutPromise]);

  if (result === '__timeout__') {
    const msg = 'MetaAPI data refresh timed out (50 s). The connection may still be establishing. Try again in a moment.';
    await supabase.from('trading_accounts').update({ sync_error: msg }).eq('id', accountId);
    console.log('[REFRESH_TIMEOUT]', { tradingAccountId: accountId });
    return { accountId, providerAccountId: account.provider_account_id, snapshotInserted: false, openPositions: 0, tradesUpserted: 0, balance: 0, equity: 0, currency: 'USD', error: msg };
  }

  if (result.snapshotInserted) {
    void evaluateAndPersistRiskEvents(accountId, actorUserId).catch((err) =>
      console.error('[REFRESH_RISK_EVAL_ERROR]', { accountId, err })
    );
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: sync all accounts that have stored credentials
// ─────────────────────────────────────────────────────────────────────────────

export async function syncAllSyncableAccounts(
  actorUserId: string | null,
): Promise<SyncSummary[]> {
  const supabase = createAdminClient();
  const { data: credRows } = await supabase
    .from('broker_credentials')
    .select('trading_account_id');

  if (!credRows || credRows.length === 0) return [];

  const results: SyncSummary[] = [];
  for (const row of credRows) {
    const summary = await syncTradingAccount(row.trading_account_id, actorUserId);
    results.push(summary);
  }
  return results;
}
