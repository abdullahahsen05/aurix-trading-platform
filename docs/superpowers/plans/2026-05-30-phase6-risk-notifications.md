# Phase 6 — Risk Engine Integration & Notifications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire synced broker data into the risk engine, persist real events and notifications, and replace all fake UI with live data.

**Architecture:** After each successful broker sync, `evaluateAndPersistRiskEvents` queries account snapshots and trade history, runs `evaluateRiskRules` (existing pure function), and writes any new breaches to `risk_events` + `notifications` — deduplicating by checking for active unacknowledged events first. The Topbar bell and trader risk page are then fed from real API routes.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase (admin client for server mutations) · Zod · React Query · Vitest

---

## File Map

| Status | Path | Purpose |
|--------|------|---------|
| **NEW** | `supabase/migrations/005_risk_notifications.sql` | Add `notifications.type`, `notifications.risk_event_id`, dedup indexes |
| **NEW** | `src/lib/services/notificationService.ts` | Notification CRUD (admin client) |
| **NEW** | `src/lib/services/riskEvaluationService.ts` | Orchestrates evaluation → DB persistence |
| **NEW** | `src/app/api/notifications/route.ts` | GET /api/notifications |
| **NEW** | `src/app/api/notifications/[id]/read/route.ts` | PATCH mark one read |
| **NEW** | `src/app/api/notifications/read-all/route.ts` | PATCH mark all read |
| **NEW** | `src/app/api/trader/daily-pnl/route.ts` | GET today's closed-trade PnL |
| **NEW** | `tests/unit/riskEvaluation.test.ts` | Unit tests for evaluation helpers + service |
| **MOD** | `src/lib/domain/types.ts` | Add `NotificationDto` |
| **MOD** | `src/lib/services/auditService.ts` | Add `RISK_EVENT_CREATED`, `ACCOUNT_SYNC_FAILED` |
| **MOD** | `src/lib/domain/risk.ts` | Richer breach messages |
| **MOD** | `src/lib/services/riskService.ts` | Add `createRiskEvent`, `findActiveRiskEvent`; fix `listRiskEvents` filter; audit on acknowledge |
| **MOD** | `src/lib/services/brokerSyncService.ts` | Wire risk eval + notifications; add `user_id` to selects |
| **MOD** | `src/components/app/Topbar.tsx` | Real notification API |
| **MOD** | `src/app/(trader)/risk/page.tsx` | Real daily PnL bar |
| **MOD** | `tests/unit/risk.test.ts` | Cover richer messages + OPEN_TRADES metric |

---

## Task 1: DB Migration 005

**Files:**
- Create: `supabase/migrations/005_risk_notifications.sql`

- [ ] **Step 1: Write migration file**

```sql
-- supabase/migrations/005_risk_notifications.sql

-- Add type column to categorise notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT;

-- Link notification to the risk event that caused it (used for dedup)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS risk_event_id UUID
  REFERENCES public.risk_events(id) ON DELETE SET NULL;

-- Prevent duplicate *active* events for the same account+rule at the DB level.
-- The application checks first; this index is a safety net.
CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_events_active_dedup
  ON public.risk_events(trading_account_id, rule_name)
  WHERE acknowledged_at IS NULL;

-- Fast lookup: "does a notification already exist for this risk_event_id?"
CREATE INDEX IF NOT EXISTS idx_notifications_risk_event
  ON public.notifications(risk_event_id)
  WHERE risk_event_id IS NOT NULL;

-- Fast unread-count query
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read_at)
  WHERE read_at IS NULL;
```

- [ ] **Step 2: Apply migration**

```powershell
npm run migrate
```

Expected: migration runs without error. If `npm run migrate` is not connected to Supabase yet, apply the SQL via the Supabase dashboard SQL editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_risk_notifications.sql
git commit -m "feat(db): add notification type/risk_event_id and dedup indexes"
```

---

## Task 2: Domain Types + Audit Action Strings

**Files:**
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/services/auditService.ts`

- [ ] **Step 1: Add `NotificationDto` to types**

In `src/lib/domain/types.ts`, add after the `RiskEventDto` interface:

```typescript
export interface NotificationDto {
  id: string
  accountId: string | null
  type: string | null
  title: string
  message: string
  readAt: string | null
  createdAt: string
}
```

- [ ] **Step 2: Add new audit action strings**

In `src/lib/services/auditService.ts`, extend the `AuditAction` union. Replace the existing type definition:

```typescript
export type AuditAction =
  | "USER_STATUS_CHANGED"
  | "USER_ROLE_CHANGED"
  | "ACCOUNT_CONNECTED"
  | "ACCOUNT_DISCONNECTED"
  | "ACCOUNT_RESTRICTED"
  | "ACCOUNT_VERIFIED"
  | "RISK_RULE_CREATED"
  | "RISK_RULE_UPDATED"
  | "RISK_EVENT_CREATED"
  | "RISK_EVENT_ACKNOWLEDGED"
  | "CRM_NOTE_CREATED"
  | "SUBSCRIPTION_UPDATED"
  | "BROKER_CREDENTIALS_STORED"
  | "ACCOUNT_SYNC_TRIGGERED"
  | "ACCOUNT_SYNC_COMPLETED"
  | "ACCOUNT_SYNC_FAILED";
```

- [ ] **Step 3: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/domain/types.ts src/lib/services/auditService.ts
git commit -m "feat(types): add NotificationDto and new audit action types"
```

---

## Task 3: Richer Breach Messages in `evaluateRiskRules`

**Files:**
- Modify: `src/lib/domain/risk.ts`
- Modify: `tests/unit/risk.test.ts`

- [ ] **Step 1: Update message format in `evaluateRiskRules`**

Replace the current `return` inside the `flatMap` in `src/lib/domain/risk.ts`:

```typescript
// Replace this:
return {
  id: `${account.accountId}-${rule.id}`,
  accountId: account.accountId,
  ruleName: rule.name,
  severity: rule.severity,
  message: `${rule.name} breached for ${account.accountName}`,
  createdAt: account.updatedAt,
};

// With this:
const observed =
  rule.metric === "DAILY_LOSS"
    ? `Daily P&L: ${dailyProfit.toFixed(2)} (threshold: -${Math.abs(rule.threshold)})`
    : rule.metric === "MAX_DRAWDOWN"
      ? `Drawdown: ${account.drawdownPercent.toFixed(2)}% (threshold: ${rule.threshold}%)`
      : `Open trades: ${openTradeCount} (limit: ${rule.threshold})`;

return {
  id: `${account.accountId}-${rule.id}`,
  accountId: account.accountId,
  ruleName: rule.name,
  severity: rule.severity,
  message: `[${rule.severity}] ${rule.name} breached for ${account.accountName}. ${observed}.`,
  createdAt: account.updatedAt,
};
```

- [ ] **Step 2: Run tests to see if any assertions break**

```powershell
npm run test 2>&1
```

- [ ] **Step 3: Fix any broken assertions in `tests/unit/risk.test.ts`**

The existing tests check `events.map(e => e.ruleName)` and `events.toHaveLength(2)`, not the message string — they should still pass. If any assertion checks the `message` field, update it to use `expect.stringContaining(rule.name)`.

Add an OPEN_TRADES test at the end of the `describe` block in `tests/unit/risk.test.ts`:

```typescript
test("creates event for open trade count breach", () => {
  const openTradesRule: RiskRuleDto = {
    id: "open-trades",
    scope: "PLATFORM",
    name: "Max 3 open trades",
    severity: "INFO",
    metric: "OPEN_TRADES",
    threshold: 3,
    enabled: true,
  };

  // account has openTradeCount: 2, but trades array passed is ignored — openTradeCount comes from account
  const accountWith3Trades = { ...account, openTradeCount: 3 };
  const events = evaluateRiskRules({
    account: accountWith3Trades,
    trades: [],
    rules: [openTradesRule],
    dailyProfit: 0,
  });

  expect(events).toHaveLength(1);
  expect(events[0].ruleName).toBe("Max 3 open trades");
  expect(events[0].message).toContain("Open trades: 3");
});

test("message includes account name, metric, threshold, and observed value", () => {
  const events = evaluateRiskRules({ account, trades, rules, dailyProfit: -1200 });
  const ddEvent = events.find((e) => e.ruleName === "Max drawdown");
  expect(ddEvent?.message).toContain("Evaluation 100K");
  expect(ddEvent?.message).toContain("Drawdown:");
  expect(ddEvent?.message).toContain("threshold:");
});
```

- [ ] **Step 4: Run tests**

```powershell
npm run test 2>&1
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/risk.ts tests/unit/risk.test.ts
git commit -m "feat(risk): richer breach messages with metric/threshold/observed values"
```

---

## Task 4: Risk Service Additions

**Files:**
- Modify: `src/lib/services/riskService.ts`

- [ ] **Step 1: Add `createRiskEvent` and `findActiveRiskEvent`**

At the end of `src/lib/services/riskService.ts`, add:

```typescript
export async function createRiskEvent(data: {
  accountId: string
  ruleName: string
  severity: string
  message: string
}): Promise<string> {
  const supabase = createAdminClient()
  const { data: row, error } = await supabase
    .from('risk_events')
    .insert({
      trading_account_id: data.accountId,
      rule_name: data.ruleName,
      severity: data.severity,
      message: data.message,
    })
    .select('id')
    .single()
  if (error || !row) throw new Error(`Failed to create risk event: ${error?.message}`)
  return row.id
}

export async function findActiveRiskEvent(
  accountId: string,
  ruleName: string
): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('risk_events')
    .select('id')
    .eq('trading_account_id', accountId)
    .eq('rule_name', ruleName)
    .is('acknowledged_at', null)
    .limit(1)
  return data?.[0]?.id ?? null
}
```

- [ ] **Step 2: Fix `listRiskEvents` to return only open (unacknowledged) events**

In `listRiskEvents`, add `.is('acknowledged_at', null)` to the query. Find the `let query = supabase.from('risk_events')...` block and update it:

```typescript
let query = supabase
  .from('risk_events')
  .select('id, trading_account_id, rule_name, severity, message, created_at')
  .is('acknowledged_at', null)
  .order('created_at', { ascending: false })
```

- [ ] **Step 3: Add audit log to `acknowledgeRiskEvent`**

Replace the current `acknowledgeRiskEvent` body:

```typescript
export async function acknowledgeRiskEvent(eventId: string, adminUserId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('risk_events')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', eventId)
  if (error) throw new Error(`Failed to acknowledge risk event: ${error.message}`)
  void writeAuditLog({
    actorUserId: adminUserId,
    action: 'RISK_EVENT_ACKNOWLEDGED',
    entityType: 'risk_event',
    entityId: eventId,
    metadata: { eventId },
  })
}
```

Add the `writeAuditLog` import at the top of `riskService.ts` if not already present:

```typescript
import { writeAuditLog } from '@/lib/services/auditService'
```

- [ ] **Step 4: Update the acknowledge route to pass adminUserId**

In `src/app/api/risk/events/[id]/acknowledge/route.ts`, update the handler to pass the admin's user id:

```typescript
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin();
    const { id } = await params;
    await acknowledgeRiskEvent(id, user.id);
    return jsonOk({ acknowledged: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
```

- [ ] **Step 5: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 20
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/riskService.ts src/app/api/risk/events/[id]/acknowledge/route.ts
git commit -m "feat(risk): add createRiskEvent/findActiveRiskEvent, filter acknowledged events, audit on acknowledge"
```

---

## Task 5: Notification Service

**Files:**
- Create: `src/lib/services/notificationService.ts`

- [ ] **Step 1: Create notification service**

```typescript
// src/lib/services/notificationService.ts
if (typeof window !== 'undefined') {
  throw new Error('[aurix] notificationService is server-only.');
}

import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationDto } from '@/lib/domain/types';

export interface CreateNotificationParams {
  userId: string;
  accountId?: string;
  type: 'RISK_EVENT' | 'SYNC_SUCCESS' | 'SYNC_FAILURE';
  title: string;
  message: string;
  riskEventId?: string;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const supabase = createAdminClient();

  // Dedup: if this notification is for a risk event, skip if one already exists
  if (params.riskEventId) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('risk_event_id', params.riskEventId)
      .limit(1);
    if (existing && existing.length > 0) return;
  }

  await supabase.from('notifications').insert({
    user_id: params.userId,
    trading_account_id: params.accountId ?? null,
    type: params.type,
    title: params.title,
    message: params.message,
    risk_event_id: params.riskEventId ?? null,
  });
}

export async function listNotifications(userId: string): Promise<NotificationDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, trading_account_id, type, title, message, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    accountId: row.trading_account_id,
    type: row.type,
    title: row.title,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  return count ?? 0;
}

export async function markNotificationRead(id: string, userId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId); // ownership enforced here
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
}
```

- [ ] **Step 2: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 20
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/notificationService.ts
git commit -m "feat(notifications): add notification service with dedup and read tracking"
```

---

## Task 6: Risk Evaluation Service

**Files:**
- Create: `src/lib/services/riskEvaluationService.ts`

The service exposes two pure helpers (for testing) and the main orchestration function.

- [ ] **Step 1: Create `riskEvaluationService.ts`**

```typescript
// src/lib/services/riskEvaluationService.ts
if (typeof window !== 'undefined') {
  throw new Error('[aurix] riskEvaluationService is server-only.');
}

import { createAdminClient } from '@/lib/supabase/admin';
import { evaluateRiskRules } from '@/lib/domain/risk';
import { mapRiskRuleToDto } from '@/lib/mappers/riskMapper';
import { createRiskEvent, findActiveRiskEvent } from '@/lib/services/riskService';
import { createNotification } from '@/lib/services/notificationService';
import { writeAuditLog } from '@/lib/services/auditService';
import type { AccountStatus, TraderAccountSummary } from '@/lib/domain/types';

// ── Pure helpers (exported for unit tests) ───────────────────────────────────

export function computeDailyPnl(
  trades: Array<{ profit: string | number }>,
): number {
  return trades.reduce((sum, t) => sum + Number(t.profit), 0);
}

export function buildAccountInput(
  accountId: string,
  accountName: string,
  brokerName: string,
  status: string,
  snapshot: { balance: number | string; equity: number | string; drawdown_percent: number | string } | null,
  openTradeCount: number,
): TraderAccountSummary {
  return {
    accountId,
    accountName,
    brokerName,
    status: status as AccountStatus,
    balance: { amount: Number(snapshot?.balance ?? 0), currency: 'USD' },
    equity: { amount: Number(snapshot?.equity ?? 0), currency: 'USD' },
    floatingPnl: { amount: 0, currency: 'USD' },
    openTradeCount,
    drawdownPercent: Number(snapshot?.drawdown_percent ?? 0),
    updatedAt: new Date().toISOString(),
  };
}

// ── Main orchestration ────────────────────────────────────────────────────────

export async function evaluateAndPersistRiskEvents(
  accountId: string,
  actorUserId: string | null,
): Promise<void> {
  const supabase = createAdminClient();

  // 1. Load account
  const { data: account, error: accountErr } = await supabase
    .from('trading_accounts')
    .select('id, user_id, account_name, broker_name, status')
    .eq('id', accountId)
    .single();

  if (accountErr || !account) {
    console.warn('[RISK_EVAL] Account not found:', accountId);
    return;
  }

  // 2. Latest snapshot (may be null if market never connected)
  const { data: snapshots } = await supabase
    .from('account_snapshots')
    .select('balance, equity, drawdown_percent')
    .eq('trading_account_id', accountId)
    .order('captured_at', { ascending: false })
    .limit(1);
  const snapshot = snapshots?.[0] ?? null;

  // 3. Today's closed trade PnL (UTC day boundary)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: closedToday } = await supabase
    .from('trades')
    .select('profit')
    .eq('trading_account_id', accountId)
    .eq('status', 'CLOSED')
    .gte('closed_at', todayStart.toISOString());
  const dailyProfit = computeDailyPnl(closedToday ?? []);

  // 4. Open trade count
  const { count: openCount } = await supabase
    .from('trades')
    .select('id', { count: 'exact', head: true })
    .eq('trading_account_id', accountId)
    .eq('status', 'OPEN');

  // 5. Risk rules (platform + account-specific)
  const { data: platformRules } = await supabase
    .from('risk_rules')
    .select('id, trading_account_id, name, severity, metric, threshold, enabled')
    .is('trading_account_id', null)
    .eq('enabled', true);

  const { data: accountRules } = await supabase
    .from('risk_rules')
    .select('id, trading_account_id, name, severity, metric, threshold, enabled')
    .eq('trading_account_id', accountId)
    .eq('enabled', true);

  const rules = [...(platformRules ?? []), ...(accountRules ?? [])].map(mapRiskRuleToDto);

  if (rules.length === 0) return;

  // 6. Evaluate
  const accountInput = buildAccountInput(
    accountId,
    account.account_name,
    account.broker_name,
    account.status,
    snapshot,
    openCount ?? 0,
  );

  const events = evaluateRiskRules({
    account: accountInput,
    trades: [],
    rules,
    dailyProfit,
  });

  // 7. Persist new events — skip duplicates
  for (const event of events) {
    const existingId = await findActiveRiskEvent(accountId, event.ruleName);
    if (existingId) continue;

    let newEventId: string;
    try {
      newEventId = await createRiskEvent({
        accountId,
        ruleName: event.ruleName,
        severity: event.severity,
        message: event.message,
      });
    } catch (err) {
      console.error('[RISK_EVAL] Failed to create risk event:', err);
      continue;
    }

    void createNotification({
      userId: account.user_id,
      accountId,
      type: 'RISK_EVENT',
      title: `Risk alert: ${event.ruleName}`,
      message: event.message,
      riskEventId: newEventId,
    }).catch((err) => console.error('[RISK_EVAL] Notification error:', err));

    void writeAuditLog({
      actorUserId,
      action: 'RISK_EVENT_CREATED',
      entityType: 'risk_event',
      entityId: newEventId,
      metadata: { ruleName: event.ruleName, severity: event.severity, accountId },
    });
  }
}
```

- [ ] **Step 2: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 20
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/riskEvaluationService.ts
git commit -m "feat(risk): add risk evaluation service with DB persistence and dedup"
```

---

## Task 7: Broker Sync Integration

**Files:**
- Modify: `src/lib/services/brokerSyncService.ts`

Three changes: (a) add `user_id` to account selects, (b) call `evaluateAndPersistRiskEvents` after success, (c) create notifications for sync events.

- [ ] **Step 1: Add `user_id` to the account select in `syncTradingAccount`**

Find the account load in `syncTradingAccount` (around line 285):

```typescript
// Change:
.select('id, broker_name, status, provider_account_id')
// To:
.select('id, broker_name, status, provider_account_id, user_id')
```

- [ ] **Step 2: Add `user_id` to the account select in `refreshAccountTrades`**

Find the account load in `refreshAccountTrades` (around line 381):

```typescript
// Change:
.select('id, status, provider_account_id')
// To:
.select('id, status, provider_account_id, user_id')
```

- [ ] **Step 3: Add imports at the top of `brokerSyncService.ts`**

After the existing imports, add:

```typescript
import { evaluateAndPersistRiskEvents } from '@/lib/services/riskEvaluationService';
import { createNotification } from '@/lib/services/notificationService';
```

- [ ] **Step 4: Wire risk evaluation and notifications after `syncTradingAccount` result**

Find the `return result;` at the end of `syncTradingAccount` (around line 362) and add handling before it:

```typescript
  // ── Post-sync: risk evaluation and notifications ──────────────────────────
  if (result.status === 'CONNECTED') {
    // Fire-and-forget — never let this fail the sync response
    void evaluateAndPersistRiskEvents(accountId, actorUserId).catch((err) =>
      console.error('[SYNC_RISK_EVAL_ERROR]', { accountId, err })
    );

    // Notify trader on first-time connection (was not CONNECTED before)
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
```

- [ ] **Step 5: Wire risk evaluation after `refreshAccountTrades` success**

Find the `return result;` at the end of `refreshAccountTrades` (around line 601) and add before it:

```typescript
  if (result.snapshotInserted) {
    void evaluateAndPersistRiskEvents(accountId, actorUserId).catch((err) =>
      console.error('[REFRESH_RISK_EVAL_ERROR]', { accountId, err })
    );
  }

  return result;
```

- [ ] **Step 6: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 20
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/brokerSyncService.ts
git commit -m "feat(sync): trigger risk evaluation and notifications after broker sync"
```

---

## Task 8: Notification API Routes

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/[id]/read/route.ts`
- Create: `src/app/api/notifications/read-all/route.ts`

- [ ] **Step 1: Create `GET /api/notifications`**

```typescript
// src/app/api/notifications/route.ts
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { listNotifications, getUnreadCount } from "@/lib/services/notificationService";

export async function GET() {
  try {
    const user = await requireAuth();
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(user.id),
      getUnreadCount(user.id),
    ]);
    return jsonOk({ notifications, unreadCount });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
```

- [ ] **Step 2: Create `PATCH /api/notifications/[id]/read`**

```typescript
// src/app/api/notifications/[id]/read/route.ts
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { markNotificationRead } from "@/lib/services/notificationService";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    await markNotificationRead(id, user.id);
    return jsonOk({ read: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
```

- [ ] **Step 3: Create `PATCH /api/notifications/read-all`**

```typescript
// src/app/api/notifications/read-all/route.ts
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { markAllNotificationsRead } from "@/lib/services/notificationService";

export async function PATCH() {
  try {
    const user = await requireAuth();
    await markAllNotificationsRead(user.id);
    return jsonOk({ cleared: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
```

- [ ] **Step 4: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 20
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notifications/
git commit -m "feat(api): add GET/PATCH notification routes"
```

---

## Task 9: Daily PnL API Endpoint

**Files:**
- Create: `src/app/api/trader/daily-pnl/route.ts`

- [ ] **Step 1: Create endpoint**

```typescript
// src/app/api/trader/daily-pnl/route.ts
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await requireAuth();
    const supabase = createAdminClient();

    // Get all trading account IDs for this user
    const { data: accounts } = await supabase
      .from('trading_accounts')
      .select('id')
      .eq('user_id', user.id);

    if (!accounts || accounts.length === 0) {
      return jsonOk({ dailyPnl: 0, currency: 'USD' });
    }

    const accountIds = accounts.map((a) => a.id);

    // UTC day boundary
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: trades } = await supabase
      .from('trades')
      .select('profit, currency')
      .in('trading_account_id', accountIds)
      .eq('status', 'CLOSED')
      .gte('closed_at', todayStart.toISOString());

    const dailyPnl = (trades ?? []).reduce((sum, t) => sum + Number(t.profit), 0);
    const currency = trades?.[0]?.currency ?? 'USD';

    return jsonOk({ dailyPnl, currency });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
```

- [ ] **Step 2: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/trader/daily-pnl/route.ts
git commit -m "feat(api): add GET /api/trader/daily-pnl endpoint"
```

---

## Task 10: Topbar — Real Notifications

**Files:**
- Modify: `src/components/app/Topbar.tsx`

- [ ] **Step 1: Replace hardcoded notifications with real API**

Replace the entire content of `src/components/app/Topbar.tsx` with:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell, CheckCircle2, Info, Menu, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { navItems } from "@/components/app/navigation";
import type { UserRole, TraderAccountSummary, NotificationDto } from "@/lib/domain/types";

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(isoString).toLocaleDateString();
}

function notificationIcon(type: string | null) {
  if (type === "SYNC_SUCCESS") return CheckCircle2;
  if (type === "SYNC_FAILURE") return AlertTriangle;
  if (type === "RISK_EVENT") return AlertTriangle;
  return Info;
}

function notificationTone(type: string | null): "danger" | "lime" | "accent" {
  if (type === "RISK_EVENT") return "danger";
  if (type === "SYNC_SUCCESS") return "lime";
  return "accent";
}

export function Topbar({
  role,
  onOpenMobileNav,
}: {
  role: UserRole;
  onOpenMobileNav: () => void;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const { data: tradingAccounts = [] } = useQuery<TraderAccountSummary[]>({
    queryKey: ["trading-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/trading-accounts");
      const json = await res.json();
      if (!json.ok) return [];
      return json.data;
    },
  });

  const { data: notifData } = useQuery<{ notifications: NotificationDto[]; unreadCount: number }>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      const json = await res.json();
      if (!json.ok) return { notifications: [], unreadCount: 0 };
      return json.data;
    },
    refetchInterval: 30_000,
  });

  const notifications = notifData?.notifications ?? [];
  const unreadCount = notifData?.unreadCount ?? 0;

  async function handleMarkRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function handleMarkAllRead() {
    await fetch("/api/notifications/read-all", { method: "PATCH" });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  const mobileItems = navItems.filter((item) => item.role === role).slice(0, 6);
  const activeItem =
    navItems
      .filter((item) => item.role === role)
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((left, right) => right.href.length - left.href.length)[0] ?? mobileItems[0];
  const subtitle =
    activeItem?.href === "/dashboard"
      ? "Equity, risk, and performance at a glance."
      : activeItem?.href === "/accounts"
        ? "Broker-linked accounts and connection health."
        : activeItem?.href === "/analytics"
          ? "Profitability, drawdown, and performance quality."
          : activeItem?.href === "/risk"
            ? "Rules, limits, and review queue monitoring."
            : activeItem?.href === "/reports"
              ? "Exports, summaries, and schedules."
              : activeItem?.href === "/settings"
                ? "Profile, broker, and security preferences."
                : role === "ADMIN"
                  ? "Platform supervision, CRM, and audit workflows."
                  : "Manage trading operations and account performance.";

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNotificationsOpen(false);
    }
    if (notificationsOpen) {
      window.addEventListener("pointerdown", handlePointerDown);
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [notificationsOpen]);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur-lg lg:px-7">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onOpenMobileNav}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-panel-strong text-muted lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="hidden md:block">
            <p className="text-lg font-bold text-foreground">{activeItem?.label ?? "Workspace"}</p>
            <p className="mt-0.5 text-xs font-medium text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((current) => !current)}
              className="relative grid h-9 w-9 place-items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-panel-strong text-muted transition hover:border-accent/40 hover:text-accent"
              aria-label="Show notifications"
              aria-expanded={notificationsOpen}
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-background">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            <div
              className={`absolute right-0 top-full z-30 mt-3 w-[min(92vw,340px)] rounded-[20px] border border-line bg-panel shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition duration-150 ${
                notificationsOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-2 opacity-0"
              }`}
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                    Notifications
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">Recent updates</p>
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-xs font-medium text-muted hover:text-accent"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="grid h-9 w-9 place-items-center rounded-full border border-line bg-background text-muted transition hover:text-foreground"
                    aria-label="Close notifications"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="max-h-80 overflow-auto p-2">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted">No notifications yet.</p>
                ) : (
                  notifications.map((notification) => {
                    const Icon = notificationIcon(notification.type);
                    const tone = notificationTone(notification.type);
                    const toneClass =
                      tone === "danger"
                        ? "text-danger bg-danger/10 border-danger/20"
                        : tone === "lime"
                          ? "text-accent-2 bg-accent-2/10 border-accent-2/20"
                          : "text-accent bg-accent/10 border-accent/20";
                    const isUnread = !notification.readAt;

                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => handleMarkRead(notification.id)}
                        className={`flex w-full items-start gap-3 rounded-[16px] border px-4 py-3 text-left transition hover:bg-panel ${
                          isUnread ? "border-accent/20 bg-background/70" : "border-line bg-background/40"
                        }`}
                      >
                        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${toneClass}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className={`truncate text-sm font-semibold ${isUnread ? "text-foreground" : "text-muted"}`}>
                              {notification.title}
                            </p>
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                              {relativeTime(notification.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted">{notification.message}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <div className="hidden rounded-full border border-line bg-panel p-1 sm:flex">
            <Link
              href="/dashboard"
              className={`btn-dark rounded-full text-xs ${role === "TRADER" ? "btn-active" : ""}`}
            >
              User
            </Link>
            <Link
              href="/admin"
              className={`btn-dark rounded-full text-xs ${role === "ADMIN" ? "btn-active" : ""}`}
            >
              Admin
            </Link>
          </div>
          <select className="h-10 rounded-full border border-[rgba(255,255,255,0.08)] bg-panel-strong px-4 text-sm font-semibold text-foreground outline-none">
            {tradingAccounts.map((account) => (
              <option key={account.accountId}>{account.accountName}</option>
            ))}
          </select>
        </div>
      </div>
      <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        <Link
          href="/dashboard"
          className={`btn-dark h-9 shrink-0 px-4 text-xs ${role === "TRADER" ? "btn-active" : ""}`}
        >
          User
        </Link>
        <Link
          href="/admin"
          className={`btn-dark h-9 shrink-0 px-4 text-xs ${role === "ADMIN" ? "btn-active" : ""}`}
        >
          Admin
        </Link>
        {mobileItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="btn-dark h-9 shrink-0 px-4 text-xs text-muted"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/app/Topbar.tsx
git commit -m "feat(ui): wire Topbar notification bell to real API"
```

---

## Task 11: Trader Risk Page — Real Daily PnL

**Files:**
- Modify: `src/app/(trader)/risk/page.tsx`

- [ ] **Step 1: Replace hardcoded `dailyLoss` with real query**

In `src/app/(trader)/risk/page.tsx`:

1. Remove `const dailyLoss = 108.29;`

2. Add a query after the existing `useQuery` blocks:

```typescript
const { data: dailyPnlData } = useQuery<{ dailyPnl: number; currency: string }>({
  queryKey: ["daily-pnl"],
  queryFn: async () => {
    const res = await fetch("/api/trader/daily-pnl");
    const json = await res.json();
    if (!json.ok) return { dailyPnl: 0, currency: "USD" };
    return json.data;
  },
});

const dailyPnl = dailyPnlData?.dailyPnl ?? 0;
```

3. Update the daily loss bar computation. Find `value={(dailyLoss / dailyLossLimit) * 100}` and replace with:

```typescript
value={dailyLossLimit > 0 ? (Math.abs(Math.min(dailyPnl, 0)) / dailyLossLimit) * 100 : 0}
```

4. Update the `RiskBar` label from `"Daily loss monitor"` to `"Today's closed P&L"`.

5. Add a subtitle under the bar to show the raw value. Update the `RiskBar` usage to also show the currency value — you can add a `subtitle` prop or simply note the current value in the `<p>` below. The simplest change: after `<p className="mt-2 text-xs text-muted">Limit {formatPercent(max)}</p>` in the `RiskBar` component, also show current value. But `RiskBar` is a local component in this file, so just add the current value to the label:

Change:
```typescript
<RiskBar
  label="Daily loss monitor"
  value={...}
  max={100}
  tone="accent"
/>
```

To:
```typescript
<RiskBar
  label={`Today's closed P&L: ${dailyPnl >= 0 ? "+" : ""}${dailyPnl.toFixed(2)}`}
  value={dailyLossLimit > 0 ? (Math.abs(Math.min(dailyPnl, 0)) / dailyLossLimit) * 100 : 0}
  max={100}
  tone={dailyPnl < -dailyLossLimit * 0.8 ? "danger" : "accent"}
/>
```

- [ ] **Step 2: Verify build**

```powershell
npm run build 2>&1 | Select-String -Pattern "error" -CaseSensitive | Select-Object -First 20
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(trader)/risk/page.tsx"
git commit -m "feat(ui): replace hardcoded daily loss bar with real closed-trade PnL"
```

---

## Task 12: Unit Tests for Risk Evaluation Service

**Files:**
- Create: `tests/unit/riskEvaluation.test.ts`

These tests verify the pure helpers and the full orchestration via mocked dependencies.

- [ ] **Step 1: Write tests**

```typescript
// tests/unit/riskEvaluation.test.ts
import { vi, describe, test, expect, beforeEach } from "vitest";

// Hoist mocks before any imports
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/services/riskService", () => ({
  createRiskEvent: vi.fn(),
  findActiveRiskEvent: vi.fn(),
}));
vi.mock("@/lib/services/notificationService", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/auditService", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { createRiskEvent, findActiveRiskEvent } from "@/lib/services/riskService";
import { createNotification } from "@/lib/services/notificationService";
import {
  computeDailyPnl,
  buildAccountInput,
  evaluateAndPersistRiskEvents,
} from "@/lib/services/riskEvaluationService";

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe("computeDailyPnl", () => {
  test("sums profit from closed trades", () => {
    expect(computeDailyPnl([{ profit: 100 }, { profit: -250 }, { profit: 50 }])).toBe(-100);
  });

  test("returns 0 for empty array", () => {
    expect(computeDailyPnl([])).toBe(0);
  });

  test("coerces string profits to numbers", () => {
    expect(computeDailyPnl([{ profit: "150.50" }, { profit: "-200.25" }])).toBeCloseTo(-49.75);
  });
});

describe("buildAccountInput", () => {
  test("maps snapshot drawdown to drawdownPercent", () => {
    const result = buildAccountInput(
      "acc1",
      "Test Account",
      "MT5",
      "CONNECTED",
      { balance: 10000, equity: 9000, drawdown_percent: 10 },
      3,
    );
    expect(result.drawdownPercent).toBe(10);
    expect(result.openTradeCount).toBe(3);
    expect(result.balance.amount).toBe(10000);
  });

  test("defaults to zero values when snapshot is null", () => {
    const result = buildAccountInput("acc1", "Test", "MT5", "CONNECTED", null, 0);
    expect(result.drawdownPercent).toBe(0);
    expect(result.balance.amount).toBe(0);
  });
});

// ── Service orchestration (mocked Supabase) ───────────────────────────────────

// Build a chainable Supabase query builder mock that awaits to `resolveValue`
function makeQuery(resolveValue: unknown) {
  const obj: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(resolveValue).then(resolve, reject),
    single: vi.fn().mockResolvedValue(resolveValue),
  };
  const chainMethods = ["select", "eq", "is", "not", "order", "limit", "gte", "lte", "neq", "in"];
  for (const method of chainMethods) {
    obj[method] = vi.fn().mockReturnValue(obj);
  }
  const insertChain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolveValue),
  };
  obj["insert"] = vi.fn().mockReturnValue(insertChain);
  return obj;
}

const mockAccount = {
  id: "acc1",
  user_id: "user1",
  account_name: "Eval 100K",
  broker_name: "MT5 Demo",
  status: "CONNECTED",
};
const mockSnapshot = [{ balance: 10000, equity: 9500, drawdown_percent: 5.0 }];
const mockDrawdownRule = {
  id: "rule1",
  trading_account_id: null,
  name: "Max DD 4%",
  severity: "WARNING",
  metric: "MAX_DRAWDOWN",
  threshold: 4,
  enabled: true,
};

function setupMockClient(overrides: {
  account?: typeof mockAccount | null;
  snapshots?: unknown[];
  closedTrades?: unknown[];
  openCount?: number;
  platformRules?: unknown[];
  accountRules?: unknown[];
}) {
  const mockFrom = vi.fn();
  mockFrom
    .mockReturnValueOnce(makeQuery({ data: overrides.account ?? mockAccount, error: null }))
    .mockReturnValueOnce(makeQuery({ data: overrides.snapshots ?? mockSnapshot, error: null }))
    .mockReturnValueOnce(makeQuery({ data: overrides.closedTrades ?? [], error: null }))
    .mockReturnValueOnce(makeQuery({ data: null, error: null, count: overrides.openCount ?? 0 }))
    .mockReturnValueOnce(
      makeQuery({ data: overrides.platformRules ?? [mockDrawdownRule], error: null }),
    )
    .mockReturnValueOnce(makeQuery({ data: overrides.accountRules ?? [], error: null }));
  vi.mocked(createAdminClient).mockReturnValue({ from: mockFrom } as ReturnType<typeof createAdminClient>);
}

describe("evaluateAndPersistRiskEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createRiskEvent).mockResolvedValue("new-event-id");
    vi.mocked(findActiveRiskEvent).mockResolvedValue(null);
    vi.mocked(createNotification).mockResolvedValue(undefined);
  });

  test("creates risk event and notification when rule is breached", async () => {
    // snapshot has 5% drawdown, rule threshold is 4% → breach
    setupMockClient({});
    await evaluateAndPersistRiskEvents("acc1", "admin-user");

    expect(createRiskEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc1",
        ruleName: "Max DD 4%",
        severity: "WARNING",
      }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user1",
        type: "RISK_EVENT",
        riskEventId: "new-event-id",
      }),
    );
  });

  test("skips event creation when active event already exists (dedup)", async () => {
    setupMockClient({});
    vi.mocked(findActiveRiskEvent).mockResolvedValue("existing-event-id");

    await evaluateAndPersistRiskEvents("acc1", "admin-user");

    expect(createRiskEvent).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  test("does not create events when no rules are breached", async () => {
    // drawdown_percent is 2%, threshold is 4% → no breach
    setupMockClient({
      snapshots: [{ balance: 10000, equity: 9800, drawdown_percent: 2.0 }],
    });

    await evaluateAndPersistRiskEvents("acc1", "admin-user");

    expect(createRiskEvent).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  test("handles missing snapshot gracefully (drawdown = 0, no breach)", async () => {
    setupMockClient({ snapshots: [] });

    await evaluateAndPersistRiskEvents("acc1", "admin-user");

    expect(createRiskEvent).not.toHaveBeenCalled();
  });

  test("handles missing account gracefully without throwing", async () => {
    const mockFrom = vi.fn().mockReturnValueOnce(
      makeQuery({ data: null, error: { message: "not found" } }),
    );
    vi.mocked(createAdminClient).mockReturnValue({ from: mockFrom } as ReturnType<typeof createAdminClient>);

    await expect(evaluateAndPersistRiskEvents("missing-id", null)).resolves.not.toThrow();
    expect(createRiskEvent).not.toHaveBeenCalled();
  });

  test("evaluates DAILY_LOSS with today closed trades", async () => {
    const dailyLossRule = {
      id: "daily",
      trading_account_id: null,
      name: "Daily Loss 500",
      severity: "CRITICAL",
      metric: "DAILY_LOSS",
      threshold: 500,
      enabled: true,
    };
    setupMockClient({
      snapshots: [{ balance: 10000, equity: 10000, drawdown_percent: 0 }],
      closedTrades: [{ profit: "-600" }], // -600 loss today, threshold is -500
      platformRules: [dailyLossRule],
    });

    await evaluateAndPersistRiskEvents("acc1", null);

    expect(createRiskEvent).toHaveBeenCalledWith(
      expect.objectContaining({ ruleName: "Daily Loss 500", severity: "CRITICAL" }),
    );
  });
});
```

- [ ] **Step 2: Run tests**

```powershell
npm run test 2>&1
```

Expected: all tests in `tests/unit/` pass, including the new `riskEvaluation.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/riskEvaluation.test.ts
git commit -m "test(risk): add unit tests for evaluation service pure helpers and orchestration"
```

---

## Task 13: Full Build + Test Verification

- [ ] **Step 1: Run full build**

```powershell
npm run build 2>&1
```

Expected: exits 0 with no TypeScript errors.

- [ ] **Step 2: Run all unit tests**

```powershell
npm run test 2>&1
```

Expected: all tests pass.

- [ ] **Step 3: Run lint (if available)**

```powershell
npm run lint 2>&1 | Select-Object -First 40
```

- [ ] **Step 4: Manual test checklist**

Follow these steps to verify end-to-end behavior without requiring open market trades:

1. **Create a MAX_DRAWDOWN rule with low threshold:**
   - Go to Admin → Risk → "Create rule"
   - Name: "Test DD Rule", Metric: MAX_DRAWDOWN, Threshold: `0.1`, Severity: WARNING
   - This threshold (0.1%) will trigger even on a tiny drawdown from any synced snapshot

2. **Sync a connected account:**
   - Go to Admin → Accounts → Sync
   - Wait for sync to complete

3. **Verify risk event created:**
   - Check Admin → Risk — the new event should appear in "Open risk events"
   - Check Trader → Risk — event should appear under "Warning notifications"

4. **Verify notification:**
   - Check the notification bell in the Topbar — unread count badge should appear
   - Click bell — the RISK_EVENT notification should be listed

5. **Acknowledge the event:**
   - Admin → Risk → Acknowledge
   - Event disappears from the queue

6. **Re-sync same account:**
   - Sync again. Since the event was acknowledged, a new event CAN be created
   - But if same breach persists and event is unacknowledged, no duplicate is created

7. **Verify notification mark-read:**
   - Click a notification in the bell → unread count decreases
   - Click "Mark all read" → count goes to 0

8. **Verify sync failure notification:**
   - Remove/corrupt broker credentials for a test account
   - Trigger admin sync → sync fails → check Topbar for SYNC_FAILURE notification

9. **Verify no crash with no trades:**
   - Create a new account with no trades
   - Trigger risk evaluation (manually via sync) → no crash, no false events

- [ ] **Step 5: Final commit if any small fixes were needed**

```bash
git add -p  # stage only intentional changes
git commit -m "fix: phase 6 post-review cleanup"
```

---

## Phase 6 Complete — Stop Here

Report to the user:
1. Files changed + summary of each
2. API routes created
3. Migration applied
4. Risk evaluation behavior
5. Dedup strategy
6. Notification behavior
7. UI changes
8. Audit logs added
9. Test results
10. Manual test results
11. Remaining work for Phase 7

**Do not continue to Phase 7 without user approval.**
