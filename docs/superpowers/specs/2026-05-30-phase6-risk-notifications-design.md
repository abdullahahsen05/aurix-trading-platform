# Phase 6 — Risk Engine Integration & Notifications

**Date:** 2026-05-30  
**Branch:** feature/supabase-backend  
**Status:** Approved

---

## Context

Phases 1–5 delivered: auth hardening, RBAC, real Supabase backend, fake-workflow removal, broker credential encryption, and MetaAPI sync. The `risk_events` table exists and the pure `evaluateRiskRules()` function is correct, but risk evaluation is never triggered after sync — no events are created automatically. The `notifications` table exists but has no service, no API, and the Topbar shows hardcoded fake data.

Phase 6 closes the loop: synced broker data flows into risk evaluation, real events and notifications are persisted, and the UI is wired to real data.

---

## Audit Summary

### What exists and works
- `evaluateRiskRules()` — pure function, correct logic for `DAILY_LOSS`, `MAX_DRAWDOWN`, `OPEN_TRADES`
- `shouldRestrictAccount()` — checks for CRITICAL severity
- `listRiskRules()`, `acknowledgeRiskEvent()`, `createRiskRule()` — solid DB operations
- Admin risk page — real rules/events, working acknowledge button
- Trader risk page — real rules/events, read-only
- `risk_events` schema — has `acknowledged_at` lifecycle column
- `notifications` schema — has `user_id`, `title`, `message`, `read_at`, `trading_account_id`
- RLS on both tables — correct

### Gaps to fix
| Gap | Impact |
|-----|--------|
| `evaluateRiskRules()` never called during sync | No events are auto-created |
| No `createRiskEvent()` in riskService | Evaluated breaches can't be persisted |
| `listRiskEvents()` doesn't filter acknowledged | Closed events pollute the queue |
| No notification service or API routes | Topbar shows fake hardcoded data |
| `notifications` table has no `type` or `risk_event_id` | Can't categorize or dedup notifications |
| No partial unique index on `risk_events` | Duplicate active events possible |
| Trader risk page: `dailyLoss = 108.29` hardcoded | Daily loss gauge is fake |
| No audit log for `RISK_EVENT_CREATED` or sync failure notification | Missing trail |

---

## Section 1 — DB Migration (`005_risk_notifications.sql`)

```sql
-- Categorize notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT;

-- Link notification to the risk event that caused it (for dedup)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS risk_event_id UUID
  REFERENCES public.risk_events(id) ON DELETE SET NULL;

-- Prevent duplicate active events at DB level
-- (app-level check runs first; this is a safety net)
CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_events_active_dedup
  ON public.risk_events(trading_account_id, rule_name)
  WHERE acknowledged_at IS NULL;

-- Fast notification dedup lookup by risk_event_id
CREATE INDEX IF NOT EXISTS idx_notifications_risk_event
  ON public.notifications(risk_event_id)
  WHERE risk_event_id IS NOT NULL;

-- Fast unread count query
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read_at)
  WHERE read_at IS NULL;
```

No destructive changes. All `ADD COLUMN IF NOT EXISTS` are nullable/backward-compatible.

---

## Section 2 — Risk Evaluation Service

### New file: `src/lib/services/riskEvaluationService.ts`

Server-only. Uses admin client throughout (no RLS — called from sync context, not request context).

**`evaluateAndPersistRiskEvents(accountId, actorUserId)`:**

1. Load account row: `id`, `user_id`, `account_name`, `broker_name`, `status`.
2. Load latest snapshot: `drawdown_percent`, `balance` — fallback to `0` if none.
3. Compute `dailyProfit`: `SUM(profit)` of today's closed trades (`closed_at >= UTC midnight`). Fallback `0`.
4. Count open trades: `COUNT(*) WHERE status = 'OPEN'`. Fallback `0`.
5. Load rules: platform rules (account IS NULL) + account-specific rules — same logic as `listRiskRules` but via admin client.
6. Build minimal account input for `evaluateRiskRules()`:
   ```ts
   const accountInput: TraderAccountSummary = {
     accountId,
     accountName: account.account_name,
     brokerName: account.broker_name,
     status: account.status,
     balance: { amount: Number(snapshot?.balance ?? 0), currency: 'USD' },
     equity: { amount: Number(snapshot?.equity ?? 0), currency: 'USD' },
     floatingPnl: { amount: 0, currency: 'USD' },
     openTradeCount,
     drawdownPercent: Number(snapshot?.drawdown_percent ?? 0),
     updatedAt: new Date().toISOString(),
   }
   ```
7. Call `evaluateRiskRules({ account: accountInput, trades: [], rules, dailyProfit })`.
   - `trades` array not needed — open trade count is already in `openTradeCount` on account.
8. For each breached event:
   - Check: `SELECT id FROM risk_events WHERE trading_account_id = ? AND rule_name = ? AND acknowledged_at IS NULL LIMIT 1`.
   - If an active event exists → skip.
   - Otherwise → insert `risk_events` row, create notification, write audit log.
9. Errors are caught and logged — never propagated to caller (sync must not fail due to risk eval).

**`createRiskEvent()` added to `riskService.ts`:**
```ts
export async function createRiskEvent(data: {
  accountId: string
  ruleName: string
  severity: string
  message: string
}): Promise<string>  // returns new event id
```

**Fix `listRiskEvents()`:** add `.is('acknowledged_at', null)` to the query. Open events only.

**Fix `acknowledgeRiskEvent()`:** write audit log `RISK_EVENT_ACKNOWLEDGED` after update.

---

## Section 3 — Broker Sync Integration

### `runMetaApiSync` — after step 8 (mark CONNECTED)
```ts
// Fire-and-forget — sync result is not affected by risk eval errors
void evaluateAndPersistRiskEvents(accountId, actorUserId).catch(err =>
  console.error('[RISK_EVAL_ERROR]', err)
)

// Notify trader on first connection (was not CONNECTED before)
if (account.status !== 'CONNECTED') {
  void createNotification({
    userId: account.user_id,
    accountId,
    type: 'SYNC_SUCCESS',
    title: 'Account connected',
    message: `${account.broker_name} account successfully connected and synced.`,
  })
}
```

### `markFailed` — sync failure path
```ts
void createNotification({
  userId: account.user_id,  // need to load user_id in markFailed
  accountId,
  type: 'SYNC_FAILURE',
  title: 'Account sync failed',
  message: safeMessage,  // already sanitized, no credentials
})
```

`markFailed` currently doesn't have `user_id` — it will be passed as a parameter from the callers that already have the account row.

### `refreshAccountTrades` — after updating `last_synced_at`
Same fire-and-forget call to `evaluateAndPersistRiskEvents()`.

---

## Section 4 — Notification Service & API

### New file: `src/lib/services/notificationService.ts`

```ts
export interface CreateNotificationParams {
  userId: string
  accountId?: string
  type: 'RISK_EVENT' | 'SYNC_SUCCESS' | 'SYNC_FAILURE'
  title: string
  message: string
  riskEventId?: string  // for dedup
}

export async function createNotification(params: CreateNotificationParams): Promise<void>
// Uses admin client. If riskEventId provided, check if notification for that event already exists — skip if yes.

export async function listNotifications(userId: string): Promise<NotificationDto[]>
// Returns own notifications, latest first.

export async function getUnreadCount(userId: string): Promise<number>

export async function markNotificationRead(id: string, userId: string): Promise<void>

export async function markAllNotificationsRead(userId: string): Promise<void>
```

### New `NotificationDto` in `src/lib/domain/types.ts`
```ts
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

### New API routes

**`GET /api/notifications`**
- `requireAuth()` — trader or admin
- Returns `{ notifications: NotificationDto[], unreadCount: number }`

**`PATCH /api/notifications/[id]/read`**
- `requireAuth()`
- Marks single notification read (ownership enforced in service)

**`PATCH /api/notifications/read-all`**
- `requireAuth()`
- Marks all user's notifications read

---

## Section 5 — UI Changes

### Topbar (`src/components/app/Topbar.tsx`)

Replace hardcoded fake data with:
```ts
const { data: notifData } = useQuery({
  queryKey: ['notifications'],
  queryFn: () => fetch('/api/notifications').then(r => r.json()).then(j => j.data),
  refetchInterval: 30_000,  // poll every 30s
})
```

- Badge shows real `unreadCount`.
- Notification list renders real `NotificationDto[]`.
- Clicking a notification calls `PATCH /api/notifications/[id]/read` and invalidates query.
- "Mark all read" button calls `PATCH /api/notifications/read-all`.

Tone mapping by type:
- `RISK_EVENT` → danger (AlertTriangle icon)
- `SYNC_SUCCESS` → lime (CheckCircle2 icon)
- `SYNC_FAILURE` → accent (AlertTriangle icon)
- null/unknown → accent (Info icon)

### Trader risk page — daily loss bar

Replace `const dailyLoss = 108.29` with a query:
```ts
const { data: todayTrades = [] } = useQuery<TradeDto[]>({
  queryKey: ['trades', 'today'],
  queryFn: async () => {
    const res = await fetch('/api/trader/trades?status=CLOSED&period=today')
    ...
  }
})
const dailyPnl = todayTrades.reduce((sum, t) => sum + t.profit.amount, 0)
```

The existing `/api/trader/trades` route (or `/api/trades`) will be used. The bar label becomes "Today's closed P&L" and shows `0` honestly when market is closed.

If no route exists for today's trades, add `?period=today` filter to the existing trade endpoint.

### Admin risk page — no changes needed

Already queries real events. Will automatically benefit from the `acknowledged_at` filter fix.

---

## Section 6 — Audit Log Changes

Add to `AuditAction` in `auditService.ts`:
- `RISK_EVENT_CREATED`
- `ACCOUNT_SYNC_FAILED`

Logged:
- `RISK_EVENT_CREATED` — per new event, metadata: `{ ruleName, severity, accountId, metric }`
- `RISK_EVENT_ACKNOWLEDGED` — already exists, add metadata: `{ eventId, acknowledgedBy }`
- `ACCOUNT_SYNC_FAILED` — in `markFailed`, metadata: `{ safeError }` (no credentials)

---

## Section 7 — Tests

### Update `tests/unit/risk.test.ts`
- Add: graceful handling when `dailyProfit = 0` and `drawdownPercent = 0` (no breach).
- Add: OPEN_TRADES rule evaluation using `openTradeCount` on account.

### New `tests/unit/riskEvaluation.test.ts`
- Mock Supabase admin client.
- Test: no events created when no breach.
- Test: event created on breach.
- Test: duplicate active event prevents second insert.
- Test: notification created alongside event.
- Test: notification NOT duplicated for same active risk event.
- Test: evaluates gracefully with no snapshot (drawdown = 0).
- Test: evaluates gracefully with no closed trades (dailyProfit = 0).

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/005_risk_notifications.sql` | New — indexes + columns |
| `src/lib/domain/types.ts` | Add `NotificationDto` |
| `src/lib/services/auditService.ts` | Add 2 audit action types |
| `src/lib/services/riskService.ts` | Add `createRiskEvent()`, fix `listRiskEvents()` filter, fix `acknowledgeRiskEvent()` audit |
| `src/lib/services/riskEvaluationService.ts` | New — evaluation + persistence |
| `src/lib/services/notificationService.ts` | New — notification CRUD |
| `src/lib/services/brokerSyncService.ts` | Wire risk eval + notifications after sync |
| `src/app/api/notifications/route.ts` | New — GET |
| `src/app/api/notifications/[id]/read/route.ts` | New — PATCH |
| `src/app/api/notifications/read-all/route.ts` | New — PATCH |
| `src/components/app/Topbar.tsx` | Real notification API |
| `src/app/(trader)/risk/page.tsx` | Real daily P&L query |
| `tests/unit/risk.test.ts` | Expanded |
| `tests/unit/riskEvaluation.test.ts` | New |

---

## Non-goals (Phase 7+)

- Email/SMS notification delivery
- Account auto-restriction on CRITICAL breach
- Real-time websocket push for notifications
- Per-account risk rule editing UI
- Scheduled daily metric aggregation
