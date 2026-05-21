# AURIX Backend Setup Guide

Full Supabase backend replacing the previous Prisma mock layer. Everything is live and connected to the hosted Supabase project.

---

## Stack

| Layer | Technology |
|---|---|
| Database | Supabase (PostgreSQL 15) |
| Auth | Supabase Auth (email + password) |
| ORM | None — direct Supabase JS client |
| API | Next.js 16 Route Handlers (App Router) |
| Session | `@supabase/ssr` cookie-based |
| Realtime | Supabase Realtime (postgres_changes) |
| Routing guard | `src/proxy.ts` (Next.js 16 Proxy convention) |

---

## Environment Variables

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://brtdyxidblyimqteduph.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6InNlcnZpY2Vfcm9sZSIsI...
SUPABASE_DB_PASSWORD=.@PJrMB5mzBRK*e
```

> **Security:** `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_PASSWORD` are server-only. Never expose them client-side (no `NEXT_PUBLIC_` prefix).

---

## Database Schema

15 tables live on Supabase. Migrations are in `supabase/migrations/`.

### Core tables

| Table | Purpose |
|---|---|
| `profiles` | Auth user extension: role, status, full_name |
| `trader_profiles` | Segment, account count, last activity |
| `trading_accounts` | Broker-linked accounts with status |
| `broker_credentials` | Encrypted broker API keys (admin-only access) |
| `account_snapshots` | Balance, equity, floating PnL snapshots |
| `trades` | All trade records (OPEN / CLOSED) |
| `daily_account_metrics` | Aggregated daily account stats |
| `risk_rules` | Platform and per-account risk guardrails |
| `risk_events` | Triggered rule violations |
| `crm_notes` | Admin relationship notes per trader |
| `crm_activities` | Audit trail of CRM actions |
| `subscriptions` | Subscription plan records |
| `notifications` | User notification queue |
| `audit_logs` | Admin action log (server-side only) |
| `user_settings` | Per-user preferences |

### Running migrations

```bash
# Requires SUPABASE_DB_PASSWORD in environment
npx ts-node scripts/run-migrations.ts
```

Migrations have already been applied to the live project. Re-run only when adding new migration files.

---

## RBAC

Two roles: `TRADER` and `ADMIN`.

| Rule | Detail |
|---|---|
| Public registration always creates `TRADER` | `handle_new_user()` DB trigger ignores metadata role |
| Admin accounts are set directly in Supabase | Or via `supabase.auth.admin.updateUserById()` |
| `src/proxy.ts` enforces routing | TRADER → `/dashboard`, ADMIN → `/admin` |
| API routes enforce with `requireAdmin()` / `requireTrader()` | From `src/lib/auth/session.ts` |
| RLS policies enforce at DB level | `is_admin()` SECURITY DEFINER function |

### Helpers

```typescript
import { requireAuth, requireAdmin, requireTrader } from '@/lib/auth/session'

// Throws 401 if not logged in, 403 if suspended
const user = await requireAuth()

// Throws 403 if not ADMIN
await requireAdmin()

// Throws 403 if neither TRADER nor ADMIN
await requireTrader()
```

---

## Supabase Clients

Three separate clients, each used in different contexts:

| File | Client | Use |
|---|---|---|
| `src/lib/supabase/client.ts` | `createBrowserClient` | Client components, browser-side |
| `src/lib/supabase/server.ts` | `createServerClient` + cookies | Server components, API routes |
| `src/lib/supabase/admin.ts` | `createServerClient` + service role | Admin operations, bypasses RLS |

> Never import `admin.ts` in client components or expose the service role key.

---

## Seed Data

Run once to populate demo users and trading data:

```bash
npx ts-node scripts/seed-supabase.ts
```

### Demo credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@aurix.local` | `Password123!` |
| Trader (FUNDED) | `ayan@aurix.local` | `Password123!` |
| Trader (AT_RISK) | `sara@aurix.local` | `Password123!` |

The seed creates: 3 users, 3 trading accounts, 28 equity snapshots (Orion account), 17 trades, 3 risk rules, 2 risk events, 3 CRM notes, and 1 active subscription.

---

## Services

All services live in `src/lib/services/`. Each uses the server Supabase client and enforces ownership.

| Service | Exported functions |
|---|---|
| `tradingAccountService` | `listTradingAccounts`, `getTradingAccount`, `createTradingAccount` |
| `tradeService` | `listTrades` |
| `analyticsService` | `getAnalyticsSummary`, `getEquityCurve` |
| `riskService` | `listRiskRules`, `listRiskEvents`, `createRiskRule`, `updateRiskRule`, `acknowledgeRiskEvent` |
| `crmService` | `listTraderProfiles`, `listCrmNotes`, `createCrmNote` |
| `adminService` | `getAdminSummary`, `listUsers`, `updateUserStatus`, `listAllAccounts`, `listAuditLogs` |

### TRADER data scoping

TRADER users only see their own data. `listTradingAccounts(userId, role)` uses `eq('user_id', userId)` for traders and no filter for admins.

---

## API Routes

All routes return `{ ok: true, data: T }` or `{ ok: false, error: { code, message } }`.

### Auth
| Method | Route | Auth required |
|---|---|---|
| GET | `/api/auth/session` | No |

### Trading accounts
| Method | Route | Auth required |
|---|---|---|
| GET | `/api/trading-accounts` | TRADER+ |
| POST | `/api/trading-accounts` | TRADER+ |
| GET | `/api/trading-accounts/[accountId]` | TRADER+ |

### Trades
| Method | Route | Auth required |
|---|---|---|
| GET | `/api/trades` | TRADER+ |

### Analytics
| Method | Route | Auth required |
|---|---|---|
| GET | `/api/analytics/summary?accountId=` | TRADER+ |
| GET | `/api/analytics/equity-curve?accountId=` | TRADER+ |

### Risk
| Method | Route | Auth required |
|---|---|---|
| GET | `/api/risk/rules?accountId=` | TRADER+ |
| GET | `/api/risk/events?accountId=` | TRADER+ |
| PATCH | `/api/risk/rules/[id]` | ADMIN |
| PATCH | `/api/risk/events/[id]/acknowledge` | ADMIN |

### CRM
| Method | Route | Auth required |
|---|---|---|
| GET | `/api/crm/traders` | ADMIN |
| GET | `/api/crm/notes` | ADMIN |

### Admin
| Method | Route | Auth required |
|---|---|---|
| GET | `/api/admin/summary` | ADMIN |
| GET | `/api/admin/accounts` | ADMIN |
| GET | `/api/admin/users` | ADMIN |
| PATCH | `/api/admin/users/[id]/status` | ADMIN |
| GET | `/api/admin/audit` | ADMIN |

### Realtime
| Method | Route | Auth required |
|---|---|---|
| GET | `/api/realtime/token` | TRADER+ |

---

## Realtime

`src/hooks/useRealtimeUpdates.ts` subscribes to `postgres_changes` on four tables:

- `account_snapshots` → invalidates `["trading-accounts"]`
- `trades` → invalidates `["trades"]`
- `risk_events` → invalidates `["risk-events"]`
- `notifications` → invalidates `["notifications"]`

The hook is mounted in each dashboard page via `useRealtimeUpdates(accountId)`. React Query handles cache invalidation and UI refresh automatically.

---

## Mappers

DB rows use `snake_case`. DTOs exposed to the UI use `camelCase`. Mappers live in `src/lib/mappers/`.

| Mapper | Input → Output |
|---|---|
| `accountMapper.ts` | `trading_accounts` row + snapshot → `TraderAccountSummary` |
| `tradeMapper.ts` | `trades` row → `TradeDto` |
| `riskMapper.ts` | `risk_rules` / `risk_events` rows → `RiskRuleDto` / `RiskEventDto` |
| `crmMapper.ts` | `crm_notes` / `trader_profiles` rows → `CrmNoteDto` / `TraderProfileDto` |

---

## Local Development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:3000`.

### Build

```bash
# Turbopack is not available on win32/x64 WASM-only mode, use webpack
npm run build -- --webpack
```

---

## Security Notes

1. **Never expose `SUPABASE_SERVICE_ROLE_KEY` client-side.** It bypasses all RLS.
2. **Public registration always creates TRADER accounts.** The DB trigger `handle_new_user()` ignores the `role` field in auth metadata.
3. **Broker credentials are admin-only.** RLS on `broker_credentials` blocks all TRADER access.
4. **Suspended users are auto-signed-out** at the proxy layer before they reach any page.
5. **Audit logs are server-insert-only.** RLS allows admin SELECT but no client INSERT.
