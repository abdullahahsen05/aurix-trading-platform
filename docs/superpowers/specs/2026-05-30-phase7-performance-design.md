# Phase 7 — Performance Optimization & Production UX

**Date:** 2026-05-30  
**Branch:** feature/supabase-backend  
**Status:** Approved

---

## Context

Phases 1–6 delivered a fully functional, security-hardened, real-data trading SaaS. Phase 7 makes it feel production-grade: fast initial loads, no N+1 database calls, scoped realtime invalidations, honest dashboard metrics, and consistent loading/empty states. No visual redesign. No fake data. No security regressions.

---

## Audit Summary

### HIGH — Fix before scaling

| File | Problem | Severity |
|------|---------|----------|
| `tradingAccountService.ts:25-44` | Loop queries snapshot + open-trade-count per account (2N+1 → N accounts = O(2N)) | HIGH |
| `adminService.ts:77-94` | Same loop pattern, all platform accounts | HIGH |
| `crmService.ts:53-66` | Loads ALL snapshots, no LIMIT, deduplicates in JS memory | HIGH |
| `analyticsService.ts:26-48` | No LIMIT on trades or snapshots — full table fetch | HIGH |
| `riskService.ts` | `listRiskEvents` has no LIMIT | HIGH |
| `adminService.ts:44-52` | `listUsers` has no LIMIT | HIGH |

### MEDIUM — Fix for UX quality

| File | Problem |
|------|---------|
| `QueryProvider.tsx` | staleTime=30s; no `refetchOnWindowFocus: false` — tab switch triggers 6-8 parallel refetches |
| `useRealtimeUpdates.ts` | One trade update invalidates accounts + equity-curve (cascades) |
| `dashboard/page.tsx` | Hardcoded `periodSummaries` (fake DAILY/WEEKLY/MONTHLY stats) mixed with real trade computations |
| `TradingChart.tsx` | External TradingView script loads synchronously on mount, blocking page |
| Various pages | Blank screens during loading, no empty states, no error handling |

### Pre-existing LOW

- `audit_logs`: already has `.limit(100)` — fine
- `crm_activities`: already has `.limit(50)` — fine
- `notifications`: already has `.limit(50)` — fine

---

## Section 1 — DB Migration 006: Views + Indexes

### New file: `supabase/migrations/006_performance_indexes.sql`

#### Views (with security_invoker = true, Postgres 15+)

Both views use `security_invoker = true` so they execute in the calling user's security context, inheriting RLS from the underlying tables. When called via the admin client (service role), RLS is bypassed as normal. When called via the SSR client (trader JWT), RLS on `account_snapshots` and `trades` applies — traders see only their own data.

```sql
-- Latest snapshot per account (DISTINCT ON is more efficient than window function
-- for the "one row per partition key" pattern and index-scans naturally).
CREATE OR REPLACE VIEW public.latest_account_snapshots
  WITH (security_invoker = true)
AS
  SELECT DISTINCT ON (trading_account_id)
    id, trading_account_id, balance, equity, floating_pnl, drawdown_percent, captured_at
  FROM public.account_snapshots
  ORDER BY trading_account_id, captured_at DESC;

-- Open trade count per account.
CREATE OR REPLACE VIEW public.account_open_trade_counts
  WITH (security_invoker = true)
AS
  SELECT trading_account_id, count(*)::int AS open_trade_count
  FROM public.trades
  WHERE status = 'OPEN'
  GROUP BY trading_account_id;
```

#### Performance Indexes

All `CREATE INDEX IF NOT EXISTS` — idempotent, safe on existing data.

```sql
-- trading_accounts
CREATE INDEX IF NOT EXISTS idx_trading_accounts_last_synced
  ON public.trading_accounts(last_synced_at DESC)
  WHERE last_synced_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trading_accounts_provider_id
  ON public.trading_accounts(provider_account_id)
  WHERE provider_account_id IS NOT NULL;

-- trades: closed_at filter for daily PnL and analytics
CREATE INDEX IF NOT EXISTS idx_trades_account_closed
  ON public.trades(trading_account_id, closed_at DESC)
  WHERE closed_at IS NOT NULL;

-- risk_events: open-queue filter (acknowledged_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_risk_events_open_queue
  ON public.risk_events(trading_account_id, created_at DESC)
  WHERE acknowledged_at IS NULL;

-- notifications: sort by created_at per user
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

-- audit_logs: filter + sort
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
  ON public.audit_logs(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs(entity_type, entity_id, created_at DESC);

-- crm
CREATE INDEX IF NOT EXISTS idx_crm_notes_trader_created
  ON public.crm_notes(trader_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_activities_trader_created
  ON public.crm_activities(trader_profile_id, created_at DESC);

-- subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_trader
  ON public.subscriptions(trader_profile_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions(status);

-- profiles: admin user filter
CREATE INDEX IF NOT EXISTS idx_profiles_role_status
  ON public.profiles(role, status);
```

**Not duplicating:** `idx_account_snapshots_account_time`, `idx_trades_account_status_opened`, `idx_risk_events_active_dedup`, `idx_notifications_user_unread`, `idx_notifications_risk_event` — all exist from earlier migrations.

---

## Section 2 — Fix N+1 Queries

### Pattern: Views replace per-account loops

**Before:** 2N+1 queries (1 accounts + N snapshots + N trade counts)  
**After:** 3 queries (1 accounts + 1 view for snapshots + 1 view for counts)

```typescript
// New helper used by both services
async function batchLoadAccountMetrics(
  supabase: SupabaseClient,
  accountIds: string[]
): Promise<{
  snapshotMap: Map<string, SnapshotRow>
  countMap: Map<string, number>
}> {
  if (accountIds.length === 0) {
    return { snapshotMap: new Map(), countMap: new Map() }
  }

  const [{ data: snapshots }, { data: counts }] = await Promise.all([
    supabase
      .from('latest_account_snapshots')
      .select('trading_account_id, balance, equity, floating_pnl, drawdown_percent')
      .in('trading_account_id', accountIds),
    supabase
      .from('account_open_trade_counts')
      .select('trading_account_id, open_trade_count')
      .in('trading_account_id', accountIds),
  ])

  return {
    snapshotMap: new Map((snapshots ?? []).map(s => [s.trading_account_id, s])),
    countMap: new Map((counts ?? []).map(c => [c.trading_account_id, c.open_trade_count])),
  }
}
```

### `tradingAccountService.listTradingAccounts`

Replace the `for` loop (lines 25-44) with:
1. Fetch accounts as before
2. Call `batchLoadAccountMetrics(supabase, accountIds)`
3. Map accounts to DTOs using the maps

### `adminService.listAllAccounts`

Same replacement — fetch all accounts, call `batchLoadAccountMetrics`, map to DTOs.

### `crmService.listTraderProfiles`

Replace the unguarded snapshot query (lines 52-67) with:
```typescript
const { data: snapRows } = await supabase
  .from('latest_account_snapshots')
  .select('trading_account_id, equity')
  .in('trading_account_id', allAccountIds)
// View guarantees one row per account — no memory dedup needed
const latestEquityByAccountId = Object.fromEntries(
  (snapRows ?? []).map(s => [s.trading_account_id, Number(s.equity)])
)
```

---

## Section 3 — Query Limits

| Service | Function | Change |
|---------|---------|--------|
| `analyticsService` | `getAnalyticsSummary` | `.limit(1000)` on trades, `.limit(730)` on snapshots |
| `analyticsService` | `getEquityCurve` | `.limit(730)` on snapshots |
| `adminService` | `listUsers` | `.limit(200)` |
| `adminService` | `listAllAccounts` | `.limit(500)` on accounts base query |
| `riskService` | `listRiskEvents` | `.limit(100)` |
| `crmService` | `listCrmNotes` (no traderId) | `.limit(50)` |
| Trades API | `GET /api/trades` | Default limit 200, `?limit=N` override |

---

## Section 4 — React Query Tuning

### `QueryProvider.tsx`

```typescript
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,           // 1 min (was 30s)
      refetchOnWindowFocus: false,  // prevent tab-switch cascade
      gcTime: 10 * 60_000,          // 10 min cache retention
      retry: 1,
    },
  },
})
```

### `useRealtimeUpdates.ts`

Reduce cascade:
- `account_snapshots` change → invalidate `['trading-accounts']` only (remove `['equity-curve']`)
- `trades` change → invalidate `['trades']` only (remove second `['trading-accounts']` invalidation — snapshot channel handles account equity updates)
- `risk_events` and `notifications` — unchanged

### Dashboard `useQuery` overrides

```typescript
// accounts: fresher data for live equity display
queryKey: ["trading-accounts"], staleTime: 30_000, refetchInterval: 60_000

// trades: moderate staleness
queryKey: ["trades"], staleTime: 60_000

// risk rules: rarely change
queryKey: ["risk-rules"], staleTime: 5 * 60_000, refetchOnWindowFocus: false
```

---

## Section 5 — Dashboard Fake Data Fix

### Period stats: use real trade data (no API changes needed)

Replace hardcoded `periodSummaries` with a `useMemo` that filters `closedTrades` by date:

```typescript
function computePeriodStats(trades: TradeDto[], period: Period) {
  const now = new Date()
  const cutoff =
    period === 'DAILY'
      ? startOfUTCDay(now)
      : period === 'WEEKLY'
        ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const periodTrades = trades.filter(
    t => t.closedAt && new Date(t.closedAt) >= cutoff
  )
  return {
    totalProfit: periodTrades.reduce((s, t) => s + t.profit.amount, 0),
    winRate: calculateWinRate(periodTrades),
    tradeCount: periodTrades.length,
    riskReward: calculateAverageWinLossRatio(periodTrades),
  }
}
```

Keep the DAILY/WEEKLY/MONTHLY tab bar — it now filters real `closedTrades`. Remove `drawdown` and `consistency` from the period summary display (can't compute period drawdown from trade DTOs without snapshot time-series). The performance rings shrink from 5 to 3 real items + the period KPI strip shows real profit/winRate/tradeCount/riskReward.

Remove `buildSparkline` (fake sparklines used in KPI strip). KPI strip will show the real period numbers.

---

## Section 6 — TradingChart Lazy Loading

Wrap in `next/dynamic`:

```typescript
// dashboard/page.tsx
const TradingChart = dynamic(
  () => import('@/components/charts/TradingChart').then(m => ({ default: m.TradingChart })),
  {
    ssr: false,
    loading: () => (
      <div className="section-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <div className="h-4 w-40 rounded bg-panel animate-pulse" />
        </div>
        <div className="px-5 py-5">
          <div className="inner-surface" style={{ height: 560 }}>
            <div className="h-full w-full rounded-2xl bg-panel animate-pulse" />
          </div>
        </div>
      </div>
    ),
  }
)
```

This makes the chart non-blocking: the rest of the dashboard renders immediately while the TradingView script loads.

---

## Section 7 — Loading / Empty / Error States

Using existing `EmptyState` component and existing token system only. No new design.

Pages to update:
- `(trader)/accounts/page.tsx` — skeleton while loading, EmptyState for no accounts
- `(trader)/dashboard/page.tsx` — skeleton for KPI strip while accounts load
- `(trader)/trades/page.tsx` — EmptyState for no trades
- `(admin)/admin/users/page.tsx` — EmptyState for no users
- `(admin)/admin/risk/page.tsx` — EmptyState for no open events (already partially done)

Error pattern (consistent with existing admin pages):
```typescript
if (isError) return (
  <div className="mt-5 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
    Failed to load data. Please refresh.
  </div>
)
```

---

## Section 8 — Migration Application

Migration 006 must be:
1. Created as `supabase/migrations/006_performance_indexes.sql`
2. Added to `ALL_MIGRATIONS` in `scripts/run-migrations.ts`
3. Applied to live Supabase (`npm run migrate`)
4. Verified: both views exist, all indexes exist, no data dropped

---

## Security Constraints (Non-negotiable)

- `latest_account_snapshots` and `account_open_trade_counts` use `security_invoker = true` — traders see only their own accounts' data via SSR client
- Admin client bypasses RLS as before — views return all data for admin queries
- No credentials in browser responses
- MetaAPI SDK remains server-only
- All API routes keep `requireTrader()` / `requireAdmin()` guards

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/006_performance_indexes.sql` | NEW — views + indexes |
| `scripts/run-migrations.ts` | Add 006 to list |
| `src/lib/services/tradingAccountService.ts` | Replace N+1 loop with view-based batch |
| `src/lib/services/adminService.ts` | Replace N+1 loop with view-based batch; add limits |
| `src/lib/services/crmService.ts` | Replace snapshot scan with view query |
| `src/lib/services/analyticsService.ts` | Add query limits |
| `src/lib/services/riskService.ts` | Add limit to listRiskEvents |
| `src/providers/QueryProvider.tsx` | staleTime 60s, refetchOnWindowFocus false, gcTime |
| `src/hooks/useRealtimeUpdates.ts` | Remove cascade invalidations |
| `src/app/(trader)/dashboard/page.tsx` | Real period stats, lazy chart, query tuning |
| `src/app/(trader)/accounts/page.tsx` | Loading/empty states |
| `src/app/(trader)/trades/page.tsx` | Loading/empty states, trade limit |
| `src/app/(admin)/admin/users/page.tsx` | Loading/empty states |
| `src/app/(admin)/admin/risk/page.tsx` | Loading/empty states |
| `src/components/charts/TradingChart.tsx` | No change — dynamic import is in the page |

---

## Non-Goals (Phase 8+)

- Period-based analytics API endpoint (DAILY/WEEKLY/MONTHLY by server-side aggregation)
- Full pagination UI with page controls
- Supabase Realtime push for notifications (replace 30s polling)
- MetaAPI SDK performance (connection pooling)
- Bundle size analysis / code splitting beyond chart lazy-load
