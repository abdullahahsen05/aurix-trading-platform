# Phase 7 — Performance Optimization & Production UX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate N+1 database queries, add query limits, tune React Query, replace fake dashboard stats with real period computations, and add loading/empty states — without changing the visual design.

**Architecture:** Two DB views (`latest_account_snapshots`, `account_open_trade_counts`) with `security_invoker = true` eliminate N+1 patterns in all account-list services. React Query defaults are tuned to reduce unnecessary refetches. Dashboard period stats are computed client-side from real trade data already in cache. TradingChart is lazy-loaded with `next/dynamic`.

**Tech Stack:** Next.js 16 · TypeScript · Supabase PostgreSQL 17 · React Query v5 · Vitest

---

## File Map

| Status | Path | Purpose |
|--------|------|---------|
| **NEW** | `supabase/migrations/006_performance_indexes.sql` | Views + indexes |
| **MOD** | `scripts/run-migrations.ts` | Add 006 to list |
| **MOD** | `src/lib/domain/dashboard.ts` | Add `computePeriodStats` pure function |
| **MOD** | `src/lib/services/tradingAccountService.ts` | Replace N+1 loop with view-based batch |
| **MOD** | `src/lib/services/adminService.ts` | Replace N+1 loop; add limits to listUsers |
| **MOD** | `src/lib/services/crmService.ts` | Replace unbounded snapshot scan with view |
| **MOD** | `src/lib/services/analyticsService.ts` | Add query limits |
| **MOD** | `src/lib/services/riskService.ts` | Add limit to listRiskEvents |
| **MOD** | `src/lib/services/tradeService.ts` | Reduce default limit from 500 → 200 |
| **MOD** | `src/providers/QueryProvider.tsx` | staleTime/refetchOnWindowFocus/gcTime |
| **MOD** | `src/hooks/useRealtimeUpdates.ts` | Remove cascade invalidations |
| **MOD** | `src/app/(trader)/dashboard/page.tsx` | Real period stats, lazy chart, remove fake |
| **MOD** | `src/app/(trader)/accounts/page.tsx` | Loading skeleton + empty state |
| **MOD** | `src/app/(trader)/trades/page.tsx` | Loading skeleton + empty state |
| **MOD** | `src/app/(admin)/admin/users/page.tsx` | Loading skeleton + empty state |
| **NEW** | `tests/unit/dashboard.test.ts` | Unit tests for computePeriodStats |

---

## Task 1: DB Migration 006 — Views and Indexes

**Files:**
- Create: `supabase/migrations/006_performance_indexes.sql`
- Modify: `scripts/run-migrations.ts`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/006_performance_indexes.sql
-- ============================================================
-- AURIX Trading Platform — Supabase Schema Migration 006
-- Phase 7: Performance indexes + account summary views
-- Additive only — safe to apply to existing data
-- ============================================================

-- ── Views ──────────────────────────────────────────────────────────────────
-- Both views use security_invoker = true (Postgres 15+) so they execute in
-- the calling session's security context. When called via the Supabase SSR
-- client (trader JWT), the underlying tables' RLS policies apply — traders
-- see only their own accounts' snapshots/trades. When called via the admin
-- service-role client, RLS is bypassed as normal.

-- Latest snapshot per account (DISTINCT ON is index-efficient for this pattern)
CREATE OR REPLACE VIEW public.latest_account_snapshots
  WITH (security_invoker = true)
AS
  SELECT DISTINCT ON (trading_account_id)
    id,
    trading_account_id,
    balance,
    equity,
    floating_pnl,
    drawdown_percent,
    captured_at
  FROM public.account_snapshots
  ORDER BY trading_account_id, captured_at DESC;

-- Open trade count per account (replaces per-account COUNT queries)
CREATE OR REPLACE VIEW public.account_open_trade_counts
  WITH (security_invoker = true)
AS
  SELECT
    trading_account_id,
    count(*)::int AS open_trade_count
  FROM public.trades
  WHERE status = 'OPEN'
  GROUP BY trading_account_id;

-- ── New performance indexes ────────────────────────────────────────────────

-- trading_accounts: sort by last sync time in admin supervision
CREATE INDEX IF NOT EXISTS idx_trading_accounts_last_synced
  ON public.trading_accounts(last_synced_at DESC)
  WHERE last_synced_at IS NOT NULL;

-- trading_accounts: MetaAPI lookup by provider account ID
CREATE INDEX IF NOT EXISTS idx_trading_accounts_provider_id
  ON public.trading_accounts(provider_account_id)
  WHERE provider_account_id IS NOT NULL;

-- trades: closed_at filter for daily PnL and analytics closed-trade queries
CREATE INDEX IF NOT EXISTS idx_trades_account_closed
  ON public.trades(trading_account_id, closed_at DESC)
  WHERE closed_at IS NOT NULL;

-- risk_events: open queue filter (acknowledged_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_risk_events_open_queue
  ON public.risk_events(trading_account_id, created_at DESC)
  WHERE acknowledged_at IS NULL;

-- notifications: sort by created_at per user (list + Topbar feed)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

-- audit_logs: filter by actor + sort (admin audit page)
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
  ON public.audit_logs(actor_user_id, created_at DESC);

-- audit_logs: entity lookup (entity_type + entity_id)
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs(entity_type, entity_id, created_at DESC);

-- crm_notes: trader timeline
CREATE INDEX IF NOT EXISTS idx_crm_notes_trader_created
  ON public.crm_notes(trader_profile_id, created_at DESC);

-- crm_activities: trader activity timeline
CREATE INDEX IF NOT EXISTS idx_crm_activities_trader_created
  ON public.crm_activities(trader_profile_id, created_at DESC);

-- subscriptions: lookup per trader + filter by status (admin subscriptions page)
CREATE INDEX IF NOT EXISTS idx_subscriptions_trader
  ON public.subscriptions(trader_profile_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions(status);

-- profiles: admin user filter by role + status
CREATE INDEX IF NOT EXISTS idx_profiles_role_status
  ON public.profiles(role, status);
```

- [ ] **Step 2: Add 006 to migration runner**

In `scripts/run-migrations.ts`, change:
```typescript
const ALL_MIGRATIONS = [
  '001_schema.sql',
  '002_rls.sql',
  '003_security_hardening.sql',
  '004_broker_sync.sql',
  '005_risk_notifications.sql',
]
```
to:
```typescript
const ALL_MIGRATIONS = [
  '001_schema.sql',
  '002_rls.sql',
  '003_security_hardening.sql',
  '004_broker_sync.sql',
  '005_risk_notifications.sql',
  '006_performance_indexes.sql',
]
```

- [ ] **Step 3: Apply migration**

```powershell
npm run migrate
```

Expected output:
```
  [skip]  001_schema.sql  (already applied)
  [skip]  002_rls.sql  (already applied)
  [skip]  003_security_hardening.sql  (already applied)
  [skip]  004_broker_sync.sql  (already applied)
  [skip]  005_risk_notifications.sql  (already applied)
  [run]   006_performance_indexes.sql
  [done]  006_performance_indexes.sql
  All migrations up to date.
```

- [ ] **Step 4: Verify views and indexes exist**

```powershell
node -e "
const { Client } = require('./node_modules/pg');
const pw = require('fs').readFileSync('.env.local','utf8').match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();
const client = new Client({ host:'db.brtdyxidblyimqteduph.supabase.co', port:5432, user:'postgres', password:pw, database:'postgres', ssl:{rejectUnauthorized:false} });
(async()=>{
  await client.connect();
  const views = await client.query(\"SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname IN ('latest_account_snapshots','account_open_trade_counts')\");
  console.log('Views:', views.rows.map(r=>r.viewname));
  const idx = await client.query(\"SELECT indexname FROM pg_indexes WHERE tablename IN ('trading_accounts','trades','risk_events','notifications','audit_logs','crm_notes','crm_activities','subscriptions','profiles') AND indexname LIKE 'idx_%' ORDER BY indexname\");
  console.log('Indexes:', idx.rows.length, 'total');
  idx.rows.forEach(r => console.log(' ', r.indexname));
  await client.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
"
```

Expected: both views listed, all 12 new indexes present.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/006_performance_indexes.sql scripts/run-migrations.ts
git commit -m "feat(db): add performance indexes and account summary views (migration 006)"
```

---

## Task 2: Fix N+1 in tradingAccountService

**Files:**
- Modify: `src/lib/services/tradingAccountService.ts`

Before this task: `listTradingAccounts` with N accounts executes 2N+1 queries (1 accounts + N snapshot lookups + N open-trade counts).  
After this task: 3 queries regardless of account count.

- [ ] **Step 1: Replace `listTradingAccounts` loop with view-based batch**

Replace the entire `listTradingAccounts` function (currently lines 7–47) with:

```typescript
export async function listTradingAccounts(userId: string, role: UserRole): Promise<TraderAccountSummary[]> {
  const supabase = role === 'ADMIN' ? createAdminClient() : await createClient()

  let query = supabase
    .from('trading_accounts')
    .select('id, account_name, broker_name, status, currency, updated_at, user_id')
    .order('created_at', { ascending: false })
    .limit(500)

  if (role !== 'ADMIN') {
    query = query.eq('user_id', userId)
  }

  const { data: accounts, error } = await query
  if (error) throw new Error(`Failed to fetch trading accounts: ${error.message}`)

  const accountIds = (accounts ?? []).map(a => a.id)
  if (accountIds.length === 0) return []

  // Batch: 2 parallel view queries instead of 2N sequential queries
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

  const snapshotMap = new Map(
    (snapshots ?? []).map(s => [s.trading_account_id, s])
  )
  const countMap = new Map(
    (counts ?? []).map(c => [c.trading_account_id, c.open_trade_count as number])
  )

  return (accounts ?? []).map(account =>
    mapAccountToDto(
      account,
      snapshotMap.get(account.id) ?? null,
      countMap.get(account.id) ?? 0,
    )
  )
}
```

- [ ] **Step 2: Replace `getTradingAccount` inline queries with views**

Replace the snapshot and trade-count queries inside `getTradingAccount` (the section after loading the account row). Find the section that does:
```typescript
const { data: snapshots } = await supabase
  .from('account_snapshots')
  // ...
const { count } = await supabase
  .from('trades')
  .select('id', { count: 'exact', head: true })
  // ...
```

Replace with:
```typescript
  const [{ data: snapshots }, { data: counts }] = await Promise.all([
    supabase
      .from('latest_account_snapshots')
      .select('trading_account_id, balance, equity, floating_pnl, drawdown_percent')
      .eq('trading_account_id', accountId),
    supabase
      .from('account_open_trade_counts')
      .select('trading_account_id, open_trade_count')
      .eq('trading_account_id', accountId),
  ])

  const snapshot = snapshots?.[0] ?? null
  const openTradeCount = counts?.[0]?.open_trade_count ?? 0
```

Then update the `mapAccountToDto` call to use `openTradeCount` instead of `count ?? 0`.

- [ ] **Step 3: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 10
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/tradingAccountService.ts
git commit -m "perf: replace N+1 account queries with view-based batch (tradingAccountService)"
```

---

## Task 3: Fix N+1 in adminService

**Files:**
- Modify: `src/lib/services/adminService.ts`

- [ ] **Step 1: Replace `listAllAccounts` loop**

Replace the entire `listAllAccounts` function with:

```typescript
export async function listAllAccounts(): Promise<TraderAccountSummary[]> {
  const supabase = createAdminClient()

  const { data: accounts, error } = await supabase
    .from('trading_accounts')
    .select('id, account_name, broker_name, status, currency, updated_at, user_id')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(`Failed to fetch accounts: ${error.message}`)

  const accountIds = (accounts ?? []).map(a => a.id)
  if (accountIds.length === 0) return []

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

  const snapshotMap = new Map(
    (snapshots ?? []).map(s => [s.trading_account_id, s])
  )
  const countMap = new Map(
    (counts ?? []).map(c => [c.trading_account_id, c.open_trade_count as number])
  )

  return (accounts ?? []).map(account =>
    mapAccountToDto(
      account,
      snapshotMap.get(account.id) ?? null,
      countMap.get(account.id) ?? 0,
    )
  )
}
```

- [ ] **Step 2: Add limit to `listUsers`**

Find `listUsers` (around line 44). Change:
```typescript
    .select('id, email, full_name, role, status, created_at')
    .order('created_at', { ascending: false })
```
to:
```typescript
    .select('id, email, full_name, role, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
```

- [ ] **Step 3: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 10
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/adminService.ts
git commit -m "perf: replace N+1 account queries with view-based batch (adminService), add listUsers limit"
```

---

## Task 4: Fix CRM Snapshot Scan

**Files:**
- Modify: `src/lib/services/crmService.ts`

Current: fetches ALL snapshots with no LIMIT, deduplicates latest-per-account in JS memory.  
Fix: use `latest_account_snapshots` view (1 row per account, no JS dedup needed).

- [ ] **Step 1: Replace unbounded snapshot scan in `listTraderProfiles`**

Find the snapshot section (lines 52–67):
```typescript
  if (allAccountIds.length > 0) {
    const { data: snapRows } = await supabase
      .from('account_snapshots')
      .select('trading_account_id, equity, captured_at')
      .in('trading_account_id', allAccountIds)
      .order('captured_at', { ascending: false })

    const seen = new Set<string>()
    for (const snap of snapRows ?? []) {
      if (!seen.has(snap.trading_account_id)) {
        seen.add(snap.trading_account_id)
        latestEquityByAccountId[snap.trading_account_id] = Number(snap.equity)
      }
    }
  }
```

Replace with:
```typescript
  if (allAccountIds.length > 0) {
    const { data: snapRows } = await supabase
      .from('latest_account_snapshots')
      .select('trading_account_id, equity')
      .in('trading_account_id', allAccountIds)
    // View guarantees one row per account — no JS dedup needed
    latestEquityByAccountId = Object.fromEntries(
      (snapRows ?? []).map(s => [s.trading_account_id, Number(s.equity)])
    )
  }
```

Also remove the `seen` Set — it's no longer needed.

- [ ] **Step 2: Also fix the `let` → `const` lint warning**

The original code has `let latestEquityByAccountId: Record<string, number> = {}` (lint warned it could be `const` since it's only assigned, not reassigned). With the new Object.fromEntries pattern, change to reassignment inside the if block. Keep `let` since we assign in the if block.

- [ ] **Step 3: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 10
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/crmService.ts
git commit -m "perf: use latest_account_snapshots view in crmService, eliminate full table scan"
```

---

## Task 5: Add Query Limits

**Files:**
- Modify: `src/lib/services/analyticsService.ts`
- Modify: `src/lib/services/riskService.ts`
- Modify: `src/lib/services/tradeService.ts`

- [ ] **Step 1: Add limits to `analyticsService`**

In `src/lib/services/analyticsService.ts`:

In `getAnalyticsSummary`, add `.limit(1000)` to the trades query:
```typescript
  const { data: tradeRows, error: tradeError } = await supabase
    .from('trades')
    .select('id, trading_account_id, symbol, side, status, volume, open_price, close_price, profit, currency, opened_at, closed_at')
    .eq('trading_account_id', accountId)
    .limit(1000)
```

And `.limit(730)` to the snapshots query (≈2 years of daily snapshots):
```typescript
  const { data: snapshots, error: snapError } = await supabase
    .from('account_snapshots')
    .select('balance, equity, captured_at')
    .eq('trading_account_id', accountId)
    .order('captured_at', { ascending: true })
    .limit(730)
```

In `getEquityCurve`, add `.limit(730)` to the snapshots query:
```typescript
  const { data: snapshots, error } = await supabase
    .from('account_snapshots')
    .select('balance, equity, captured_at')
    .eq('trading_account_id', accountId)
    .order('captured_at', { ascending: true })
    .limit(730)
```

- [ ] **Step 2: Add limit to `listRiskEvents`**

In `src/lib/services/riskService.ts`, find `listRiskEvents`. Add `.limit(100)` before `.order(...)`:

```typescript
  let query = supabase
    .from('risk_events')
    .select('id, trading_account_id, rule_name, severity, message, created_at')
    .is('acknowledged_at', null)
    .order('created_at', { ascending: false })
    .limit(100)
```

- [ ] **Step 3: Reduce trades default limit**

In `src/lib/services/tradeService.ts`, change the default limit from 500 to 200:
```typescript
    .limit(params.limit ?? 200)
```

- [ ] **Step 4: Verify build and tests pass**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 10
npm run test 2>&1 | tail -6
```

Expected: build clean, all 63 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/analyticsService.ts src/lib/services/riskService.ts src/lib/services/tradeService.ts
git commit -m "perf: add query limits to analytics, risk events, and trades services"
```

---

## Task 6: React Query Tuning

**Files:**
- Modify: `src/providers/QueryProvider.tsx`
- Modify: `src/hooks/useRealtimeUpdates.ts`

- [ ] **Step 1: Update QueryProvider defaults**

Replace the entire `src/providers/QueryProvider.tsx` with:

```typescript
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,           // 1 min — reduces refetch rate vs 30s default
        gcTime: 10 * 60_000,          // 10 min cache retention
        refetchOnWindowFocus: false,  // tab switch no longer triggers 6-8 parallel fetches
        retry: 1,
      },
    },
  }))
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

- [ ] **Step 2: Reduce cascade in useRealtimeUpdates**

Replace the entire `src/hooks/useRealtimeUpdates.ts` with:

```typescript
'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscribe to Supabase Realtime events and invalidate React Query caches.
 * Call this hook once in a top-level layout or dashboard component.
 *
 * Cascade reduction vs previous version:
 * - account_snapshots change → invalidates ['trading-accounts'] only
 *   (equity-curve uses its own staleTime and will refresh naturally)
 * - trades change → invalidates ['trades'] only
 *   (account equity updates come via the snapshot channel after sync)
 */
export function useRealtimeUpdates(accountIds?: string[]) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createClient()

    const snapshotChannel = supabase
      .channel('account-snapshots')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'account_snapshots',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['trading-accounts'] })
        // equity-curve intentionally not invalidated here — it has its own staleTime
      })
      .subscribe()

    const tradeChannel = supabase
      .channel('trades-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trades',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['trades'] })
        // trading-accounts intentionally not invalidated here — snapshot channel handles equity
      })
      .subscribe()

    const riskChannel = supabase
      .channel('risk-events-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'risk_events',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['risk-events'] })
      })
      .subscribe()

    const notificationChannel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(snapshotChannel)
      supabase.removeChannel(tradeChannel)
      supabase.removeChannel(riskChannel)
      supabase.removeChannel(notificationChannel)
    }
  }, [queryClient])
}
```

- [ ] **Step 3: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 10
```

- [ ] **Step 4: Commit**

```bash
git add src/providers/QueryProvider.tsx src/hooks/useRealtimeUpdates.ts
git commit -m "perf: tune React Query defaults and remove cascade realtime invalidations"
```

---

## Task 7: Real Period Stats + Lazy Chart (TDD)

**Files:**
- Modify: `src/lib/domain/dashboard.ts`
- Create: `tests/unit/dashboard.test.ts`
- Modify: `src/app/(trader)/dashboard/page.tsx`

### 7a: Add `computePeriodStats` pure function (TDD)

- [ ] **Step 1: Write failing test**

Create `tests/unit/dashboard.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { computePeriodStats } from '@/lib/domain/dashboard'
import type { TradeDto } from '@/lib/domain/types'

const usd = (amount: number) => ({ amount, currency: 'USD' })

function makeTrade(overrides: Partial<TradeDto> & { closedAt: string | null }): TradeDto {
  return {
    id: Math.random().toString(),
    accountId: 'acc1',
    symbol: 'EURUSD',
    side: 'BUY',
    status: overrides.closedAt ? 'CLOSED' : 'OPEN',
    volume: 1,
    openPrice: 1.1,
    closePrice: overrides.closedAt ? 1.11 : null,
    profit: usd(overrides.profit ?? 0),
    openedAt: '2026-05-01T10:00:00Z',
    closedAt: overrides.closedAt,
    ...overrides,
  }
}

// Use a fixed "now" for deterministic tests: 2026-05-30T15:00:00Z
const NOW = new Date('2026-05-30T15:00:00Z')
const TODAY_START = new Date('2026-05-30T00:00:00Z')
const YESTERDAY = new Date('2026-05-29T12:00:00Z').toISOString()
const TODAY = new Date('2026-05-30T10:00:00Z').toISOString()
const SIX_DAYS_AGO = new Date('2026-05-24T10:00:00Z').toISOString()
const THIRTY_ONE_DAYS_AGO = new Date('2026-04-29T10:00:00Z').toISOString()

const trades: TradeDto[] = [
  makeTrade({ profit: usd(200), closedAt: TODAY }),          // today, win
  makeTrade({ profit: usd(-50), closedAt: TODAY }),          // today, loss
  makeTrade({ profit: usd(100), closedAt: SIX_DAYS_AGO }),   // this week, win
  makeTrade({ profit: usd(-80), closedAt: YESTERDAY }),      // this week, loss
  makeTrade({ profit: usd(300), closedAt: THIRTY_ONE_DAYS_AGO }), // outside all periods
  makeTrade({ profit: usd(50), closedAt: null }),            // open trade, excluded
]

describe('computePeriodStats', () => {
  test('DAILY: only includes trades closed today', () => {
    const stats = computePeriodStats(trades, 'DAILY', NOW)
    expect(stats.tradeCount).toBe(2)
    expect(stats.totalProfit).toBeCloseTo(150)
  })

  test('WEEKLY: includes last 7 days including today', () => {
    const stats = computePeriodStats(trades, 'WEEKLY', NOW)
    expect(stats.tradeCount).toBe(4)
    expect(stats.totalProfit).toBeCloseTo(170)
  })

  test('MONTHLY: includes last 30 days, excludes 31-day-old trade', () => {
    const stats = computePeriodStats(trades, 'MONTHLY', NOW)
    expect(stats.tradeCount).toBe(4) // same as weekly in this fixture
    expect(stats.totalProfit).toBeCloseTo(170)
  })

  test('DAILY: empty when no trades today', () => {
    const stats = computePeriodStats([], 'DAILY', NOW)
    expect(stats.tradeCount).toBe(0)
    expect(stats.totalProfit).toBe(0)
    expect(stats.winRate).toBe(0)
    expect(stats.riskReward).toBe(0)
  })

  test('DAILY: winRate is 50% for 1 win + 1 loss', () => {
    const stats = computePeriodStats(trades, 'DAILY', NOW)
    expect(stats.winRate).toBe(50)
  })

  test('open trades are excluded from all periods', () => {
    const openOnly = [makeTrade({ profit: usd(999), closedAt: null })]
    const stats = computePeriodStats(openOnly, 'DAILY', NOW)
    expect(stats.tradeCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```powershell
npm run test -- tests/unit/dashboard.test.ts 2>&1 | tail -10
```

Expected: FAIL with "computePeriodStats is not a function" (not yet implemented).

- [ ] **Step 3: Implement `computePeriodStats` in `dashboard.ts`**

Replace `src/lib/domain/dashboard.ts` with:

```typescript
import type { TradeDto } from '@/lib/domain/types'
import { calculateWinRate, calculateAverageWinLossRatio } from '@/lib/domain/metrics'

export type Period = "DAILY" | "WEEKLY" | "MONTHLY";

export type DashboardView = "CURRENT_EQUITY" | "CHECK_LIMITS" | "PROFIT_SUMMARY" | "CALENDAR_TRACKER";

export interface PeriodStats {
  totalProfit: number
  winRate: number
  tradeCount: number
  riskReward: number
}

/**
 * Compute real period statistics from a trades array.
 * @param trades - Full list of trades (open + closed)
 * @param period - DAILY (UTC today), WEEKLY (last 7 days), MONTHLY (last 30 days)
 * @param now - Reference timestamp; defaults to current time. Pass explicitly in tests.
 */
export function computePeriodStats(
  trades: TradeDto[],
  period: Period,
  now: Date = new Date(),
): PeriodStats {
  const cutoff = new Date(now)
  if (period === 'DAILY') {
    cutoff.setUTCHours(0, 0, 0, 0)
  } else if (period === 'WEEKLY') {
    cutoff.setTime(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else {
    cutoff.setTime(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }

  const periodTrades = trades.filter(
    t => t.status === 'CLOSED' && t.closedAt != null && new Date(t.closedAt) >= cutoff
  )

  return {
    totalProfit: periodTrades.reduce((s, t) => s + t.profit.amount, 0),
    winRate: calculateWinRate(periodTrades),
    tradeCount: periodTrades.length,
    riskReward: calculateAverageWinLossRatio(periodTrades),
  }
}
```

- [ ] **Step 4: Run test — expect pass**

```powershell
npm run test -- tests/unit/dashboard.test.ts 2>&1 | tail -10
```

Expected: all 6 tests PASS.

### 7b: Wire dashboard page to real period stats + lazy chart

- [ ] **Step 5: Update dashboard page**

In `src/app/(trader)/dashboard/page.tsx`, make these surgical changes:

**a) Replace the static import of TradingChart with dynamic:**

Remove:
```typescript
import { TradingChart } from "@/components/charts/TradingChart";
```

Add at the top (after existing imports):
```typescript
import dynamic from 'next/dynamic';

const TradingChart = dynamic(
  () => import('@/components/charts/TradingChart').then(m => ({ default: m.TradingChart })),
  {
    ssr: false,
    loading: () => (
      <div className="section-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <div className="h-4 w-40 rounded bg-panel animate-pulse" />
          <div className="mt-2 h-3 w-24 rounded bg-panel animate-pulse" />
        </div>
        <div className="px-5 py-5">
          <div className="inner-surface overflow-hidden" style={{ height: 560 }}>
            <div className="h-full w-full rounded-2xl bg-panel animate-pulse" />
          </div>
        </div>
      </div>
    ),
  }
)
```

**b) Add import for `computePeriodStats` and `PeriodStats`:**

Add to existing imports:
```typescript
import { computePeriodStats, type PeriodStats } from "@/lib/domain/dashboard";
```

**c) Remove `buildSparkline` function entirely** (lines 64-70) — it produced fake sparklines.

**d) Remove the hardcoded `periodSummaries` object entirely** (lines 27-62).

**e) After the existing `useMemo` blocks (after line 198), add:**

```typescript
  const periodStats = useMemo<PeriodStats>(
    () => computePeriodStats(closedTrades, selectedPeriod),
    [closedTrades, selectedPeriod],
  );
```

**f) Replace all `summary.*` references with `periodStats.*`:**

- `summary.winRate` → `periodStats.winRate`
- `summary.riskReward` → `periodStats.riskReward`
- `summary.totalProfit` → `periodStats.totalProfit`
- `summary.tradeCount` → `periodStats.tradeCount`
- `summary.drawdown` → `baseAccount?.drawdownPercent ?? 0` (use real account drawdown)
- `summary.consistency` → remove or replace with `periodStats.winRate` (closest proxy)

**g) Remove `sparkline` props from `kpiItems`** — set each to `sparkline: []` (empty array removes sparkline from the KPI card without TS error).

**h) Update the 5-item `performanceRings` array** — remove items 4 and 5 that used `summary.winRate` and `summary.riskReward` (the period-specific ring items). The remaining 3 rings use only real computed values:

```typescript
  const performanceRings = useMemo<PerformanceRingItem[]>(
    () => [
      {
        label: "Win %",
        value: formatPercent(tradeWinRate),
        status: tradeWinRate >= 60 ? "Excellent" : tradeWinRate >= 50 ? "Good" : "Average",
        statusTone: tradeWinRate >= 60 ? ("lime" as const) : tradeWinRate >= 50 ? ("accent" as const) : ("muted" as const),
        progress: tradeWinRate / 100,
        tone: "yellow" as const,
      },
      {
        label: "Profit Factor",
        value: profitFactor.toFixed(2),
        status: profitFactor >= 2 ? "Excellent" : profitFactor >= 1.4 ? "Good" : "Average",
        statusTone: profitFactor >= 2 ? ("lime" as const) : profitFactor >= 1.4 ? ("accent" as const) : ("muted" as const),
        progress: Math.min(profitFactor / 4, 1),
        tone: "lime" as const,
      },
      {
        label: "Win/Loss",
        value: avgWinLoss.toFixed(2),
        status: avgWinLoss >= 1.8 ? "Good" : "Average",
        statusTone: avgWinLoss >= 1.8 ? ("accent" as const) : ("muted" as const),
        progress: Math.min(avgWinLoss / 4, 1),
        tone: "yellow" as const,
      },
    ],
    [avgWinLoss, profitFactor, tradeWinRate],
  );
```

**i) Add per-query staleTime/refetchInterval overrides** — find the three `useQuery` calls and add options:

```typescript
  const { data: accounts = [] } = useQuery<TraderAccountSummary[]>({
    queryKey: ["trading-accounts"],
    queryFn: async () => { /* existing */ },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: trades = [] } = useQuery<TradeDto[]>({
    queryKey: ["trades"],
    queryFn: async () => { /* existing */ },
    staleTime: 60_000,
  });

  const { data: riskRules = [] } = useQuery<RiskRuleDto[]>({
    queryKey: ["risk-rules"],
    queryFn: async () => { /* existing */ },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
```

- [ ] **Step 6: Run all tests**

```powershell
npm run test 2>&1 | tail -8
```

Expected: all tests pass (now 69 total — 6 new dashboard tests added).

- [ ] **Step 7: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 10
```

Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/dashboard.ts tests/unit/dashboard.test.ts "src/app/(trader)/dashboard/page.tsx"
git commit -m "feat(dashboard): real period stats from trades, lazy TradingChart, remove fake periodSummaries"
```

---

## Task 8: Loading and Empty States

**Files:**
- Modify: `src/app/(trader)/accounts/page.tsx`
- Modify: `src/app/(trader)/trades/page.tsx`
- Modify: `src/app/(admin)/admin/users/page.tsx`

For each page, the pattern is:
1. Extract `isLoading`, `isError`, `data` from `useQuery`
2. Show skeleton while loading
3. Show `EmptyState` when data is empty
4. Show error notice on failure

The `EmptyState` component is already in `@/components/app/WorkspaceUI`.

- [ ] **Step 1: Update trader accounts page**

In `src/app/(trader)/accounts/page.tsx`, find the main `useQuery` for trading accounts and update the destructure:

```typescript
  const { data: tradingAccounts = [], isLoading, isError } = useQuery<TraderAccountSummary[]>({
    queryKey: ["trading-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/trading-accounts");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load accounts");
      return json.data;
    },
  });
```

Then add loading/error/empty rendering before the accounts table (find where the accounts are mapped and add guards):

```typescript
  // Loading state
  if (isLoading) {
    return (
      <WorkspacePage eyebrow="Accounts" title="My trading accounts">
        <div className="mt-5 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl border border-line bg-panel animate-pulse" />
          ))}
        </div>
      </WorkspacePage>
    )
  }

  // Error state
  if (isError) {
    return (
      <WorkspacePage eyebrow="Accounts" title="My trading accounts">
        <div className="mt-5 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          Failed to load accounts. Please refresh the page.
        </div>
      </WorkspacePage>
    )
  }
```

And in the zero-accounts case, where the page currently renders nothing or a blank table, add after the loading/error guards (the `EmptyState` inside the page body, not replacing the whole WorkspacePage):

```typescript
  // Empty state (inside WorkspacePage, in place of the account cards)
  {tradingAccounts.length === 0 && (
    <EmptyState
      title="No accounts yet"
      description="Connect a broker account to start tracking your performance."
    />
  )}
```

- [ ] **Step 2: Update trader trades page**

In `src/app/(trader)/trades/page.tsx`, apply the same pattern:

```typescript
  const { data: trades = [], isLoading, isError } = useQuery<TradeDto[]>({
    queryKey: ["trades"],
    // ... existing queryFn
  });
```

Add loading skeleton (rows of ghost table lines):
```typescript
  if (isLoading) {
    return (
      <WorkspacePage eyebrow="Trades" title="Trade ledger">
        <div className="mt-5 space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl border border-line bg-panel animate-pulse" />
          ))}
        </div>
      </WorkspacePage>
    )
  }
```

Empty state (inside the data table area):
```typescript
  {trades.length === 0 && (
    <EmptyState
      title="No trades yet"
      description="Trades will appear here after your account syncs with your broker."
    />
  )}
```

- [ ] **Step 3: Update admin users page**

In `src/app/(admin)/admin/users/page.tsx`, apply the same pattern for the users query:

```typescript
  const { data: users = [], isLoading, isError } = useQuery({
    queryKey: ["admin-users"],
    // ... existing queryFn
  });
```

Loading and empty states matching the admin table style:
```typescript
  if (isLoading) {
    return (
      <WorkspacePage eyebrow="Admin" title="Users">
        <div className="mt-5 space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-line bg-panel animate-pulse" />
          ))}
        </div>
      </WorkspacePage>
    )
  }

  // In the table body: empty state if no users
  {users.length === 0 && (
    <EmptyState title="No users found" description="No users match the current filter." />
  )}
```

- [ ] **Step 4: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 10
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/(trader)/accounts/page.tsx" "src/app/(trader)/trades/page.tsx" "src/app/(admin)/admin/users/page.tsx"
git commit -m "feat(ux): add loading skeletons and empty states to accounts, trades, and users pages"
```

---

## Task 9: Final Build, Test, and Lint Verification

- [ ] **Step 1: Full build**

```powershell
npm run build 2>&1
```

Expected: exits 0, no TypeScript errors, all routes generated.

- [ ] **Step 2: Full test suite**

```powershell
npm run test 2>&1
```

Expected: all tests pass (target: 69 tests — 63 original + 6 new dashboard tests).

- [ ] **Step 3: Lint check on Phase 7 files**

```powershell
npm run lint 2>&1 | Select-String -Pattern "dashboard|tradingAccount|adminService|crmService|analytics|riskService|QueryProvider|useRealtime" | head -30
```

Expected: no new errors in Phase 7 files.

- [ ] **Step 4: Verify migration 006 in DB**

```powershell
node -e "
const { Client } = require('./node_modules/pg');
const pw = require('fs').readFileSync('.env.local','utf8').match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();
const client = new Client({ host:'db.brtdyxidblyimqteduph.supabase.co', port:5432, user:'postgres', password:pw, database:'postgres', ssl:{rejectUnauthorized:false} });
(async()=>{
  await client.connect();
  const v = await client.query(\"SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname IN ('latest_account_snapshots','account_open_trade_counts')\");
  console.log('Views:', v.rows.map(r=>r.viewname));
  const m = await client.query(\"SELECT name FROM public._migrations ORDER BY name\");
  console.log('Applied migrations:', m.rows.map(r=>r.name));
  await client.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
"
```

Expected: both views listed, `006_performance_indexes.sql` in migrations list.

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -p
git commit -m "fix: phase 7 post-review cleanup"
```

---

## Manual Performance Test Checklist

After all tasks complete:

**N+1 verification:**
- Open browser DevTools → Network tab
- Navigate to `/accounts` — should see 1-2 API calls (not N per account)
- Navigate to `/admin/accounts` — same
- Navigate to `/admin/traders` (CRM) — no excessive snapshot calls

**Loading states:**
- Hard-refresh `/accounts` — skeleton appears, then accounts load
- Hard-refresh `/trades` — skeleton appears, then trades load
- Hard-refresh `/admin/users` — skeleton appears, then users load

**Dashboard:**
- Switch DAILY/WEEKLY/MONTHLY tabs — performance rings update with real trade data
- Floating PnL KPI strip shows no fake sparkline drift
- TradingChart shows skeleton placeholder while loading, then chart appears

**Realtime (if broker connected):**
- Trigger a sync — only `['trading-accounts']` invalidates (not `['equity-curve']`)
- Tab away and back — no visible refetch spinner

**Security regression:**
- Trader at `/accounts` sees only own accounts
- Admin at `/admin/accounts` sees all accounts
- `/api/trades` response: no `password`, `login`, `server`, `encrypted_reference` fields

---

## Phase 7 Complete — Stop Here

Report to the user:
1. N+1 before/after query counts
2. DB views + indexes added and verified
3. Migration 006 applied
4. Query limits added
5. React Query changes
6. Realtime changes
7. Dashboard changes (real vs fake)
8. Loading/empty states added
9. Test results
10. Remaining issues for Phase 8
