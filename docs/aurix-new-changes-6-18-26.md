# Aurix — Full Implementation Reference (Session Handoff, 2026-06-18)

Complete record of everything built/changed this session, on top of the original
trader/admin prop-trading dashboard. **Build passes · 107 unit tests pass · migrations 007–012 applied.**

Stack: **Next.js 16** (App Router) · React 19 · TypeScript · Supabase (Postgres + Auth + RLS) ·
TanStack Query · Tailwind v4 (dark theme) · MetaAPI SDK · Gemini (`@google/genai`).
Roles: **ADMIN / TRADER / PARTNER**.

---

## 0. Platform foundation (pre-existing, relied on / hardened this session)
- Supabase Auth + Row Level Security + RBAC. Session helpers: `requireAuth`, `requireTrader`, `requireAdmin`, `requirePartner`, `assertCanAccessAccount` (`src/lib/auth/session.ts`); predicates in `rbac.ts` (`isAdmin/isTrader/isPartner/canAccess*`).
- Route protection in **`src/proxy.ts`** (Next 16 renamed middleware → proxy): redirects by DB role; isolates partners to `/partner/*`; API routes pass through to their own guards.
- API envelope: `jsonOk(data)` / `jsonFail(code, message, status)`; routes catch typed errors (`AuthError`, `CopyError`, `PartnerError`, `BrokerCredentialError`, `WorkerAuthError`).
- Core tables: `profiles`, `trader_profiles`, `trading_accounts`, `broker_credentials`, `account_snapshots`, `trades`, `risk_rules`, `risk_events`, `crm_notes`, `crm_activities`, `subscriptions`, `notifications`, `audit_logs`, `user_settings` + views `latest_account_snapshots`, `account_open_trade_counts`.
- Audit via `writeAuditLog(...)`; UI built from shared `WorkspaceUI` components + `RouteStates` (loading/error/empty) in the dark theme.

---

## 1. Migrations added this session (all applied to the live DB)
| File | Adds |
|---|---|
| `007_ai_assistant.sql` | `economic_calendar_events`, `ai_usage_logs` (metadata-only), `ai_user_limits` + RLS + indexes |
| `008_partner_dashboard.sql` | `profiles.role` += `PARTNER`; `trader_profiles.partner_id` + `partner_assigned_at`; `crm_notes.note_source`; `partner_profiles`, `partner_commissions`; `is_partner()` helper |
| `009_copy_trading.sql` | `copy_strategies`, `copy_master_events`, `copy_strategy_followers`, `copy_execution_logs`, `copy_global_settings` (single-row) + RLS |
| `010_broker_integration.sql` | `trading_accounts.provider/provider_account_id/sync_error/last_synced_at`; `trades.external_trade_id` + unique idx; `broker_operation_logs` |
| `011_performance_indexes.sql` | `notifications(user_id, created_at DESC)` |
| `012_background_jobs.sql` | `background_jobs` + indexes + admin RLS + atomic `claim_background_jobs()` (`FOR UPDATE SKIP LOCKED`) |

Runner: `npm run migrate` (uses `SUPABASE_DB_PASSWORD`; the `ALL_MIGRATIONS` array in `scripts/run-migrations.ts` is the source of truth). Note: `003`/`004` are referenced in the array but the files never existed — `010` backfilled the broker columns `004` was meant to add.

---

## 2. Phase 1 — White-Label AI Trading Assistant ✅ (verified live)
**What it does:** a branded Gemini-powered assistant for traders, grounded in their real account data, plus admin controls and an economic-calendar news feed.

**Pages**
- Trader `/ai` — chat (suggested prompts, browser-persisted history per user with "Clear") + **Advanced Chart Analysis** (image upload → vision analysis with risk disclaimer).
- Admin `/admin/ai` — usage analytics, per-user enable/disable + daily limits.
- Admin `/admin/economic-calendar` — minimal CRUD; events feed the assistant's news context.

**API:** `POST /api/ai/chat`, `POST /api/ai/chart-analysis`, `GET /api/economic-calendar`, `POST/PATCH/DELETE /api/admin/economic-calendar`, `GET /api/admin/ai/usage`, `GET /api/admin/ai/users`, `PATCH /api/admin/ai/users/[id]/limits`, `POST /api/auth/referral` (shared w/ Phase 2).

**Server-only libs:** `src/lib/ai/{geminiClient,systemPrompt,contextBuilder,symbols,rateLimit,types}.ts`.

**Behavior/safety:** identity hardcoded as the Aurix assistant (never says Gemini); context builder pulls **only the logged-in trader's** balance/equity/PnL/drawdown/open+recent trades/risk events + upcoming HIGH/MEDIUM news for their active currencies; ownership-checked (`accountId` must belong to the user → else FORBIDDEN). Rate-limited (chat 20/day, chart 3/day via `ai_usage_logs`), per-user overrides + global disable in `ai_user_limits`. Models env-driven (`AI_DEFAULT_MODEL`/`AI_CHART_MODEL` = `gemini-2.5-flash`; pro is quota-0 on the free key). Retries 503/429. Keys server-only; **metadata-only** logging (no prompts/responses/secrets).

## 3. Phase 2 — Partner Dashboard ✅
**What it does:** a third role (PARTNER) that monitors only its assigned/referred traders.

**Pages:** `/partner` (overview: assigned traders, team equity/PnL, risk queue, activity), `/partner/traders` (search/filter + detail), `/partner/crm` (own notes), `/partner/commissions` (ledger + CSV). Admin manages partners + assigns traders in `/admin/users` (role control + "Assigned partner" dropdown).

**API:** `GET /api/partner/{summary,traders,traders/[id],risk-events,activities,commissions,commissions/export,crm/notes}`, `POST /api/partner/crm/notes`. Admin: `GET /api/admin/partners`, `PATCH /api/admin/users/[id]/role`, `PATCH /api/admin/traders/[id]/partner`, `GET/POST /api/admin/partners/[id]/commissions`, `PATCH /api/admin/partner-commissions/[id]/status`.

**Libs:** `partnerService.ts`, `partnerAdminService.ts`, `lib/partner/{types,referral}.ts`.

**Behavior/safety:** every partner query filters `partner_id = <authenticated partner>`; `assertTraderAssigned` → 403 on unowned traders; `proxy.ts` isolates partners (API excluded so their own fetches work). Referral links `/register?partner=CODE` → `/api/auth/referral` claims on signup. Commissions are an **internal ledger** (PENDING→APPROVED→PAID/CANCELLED) — no payouts. PARTNER cannot reach admin/trader/copy pages.

## 4. Phase 3 — Copy Trading Foundation ✅
**What it does:** master→follower copy framework, simulation-first, live execution behind strict gates.

**Pages:** Admin `/admin/copy` (global safety cards, strategy table + create dialog, master events, simulation + execution logs, kill switch, **Execute** behind a confirm dialog). Trader `/copy-trading` (browse strategies, **consent** opt-in, pause/resume/revoke, own logs).

**API:** Admin `/api/admin/copy/{strategies, strategies/[id], strategies/[id]/monitor, strategies/[id]/events, strategies/[id]/simulate, events/[id]/simulate, events/[id]/execute, logs, logs/[id]/retry, settings}`. Trader `/api/copy/{strategies, my-subscriptions, strategies/[id]/follow, subscriptions/[id], logs}`.

**Libs:** `copyTradingService.ts` (strategy CRUD, master monitoring via `trades` diff, simulation engine, gated live execution); pure + unit-tested `lib/copy/{lotScaling,eligibility,types}.ts`.

**Behavior/safety:** default mode SIMULATION; `copy_global_settings.live_copy_enabled` defaults false + emergency-stop kill switch; lot scaling has 4 modes (fixed/multiplier/balance/equity-proportional) with clamp/step/zero-equity guards; eligibility checks consent/status/connected/symbol-lists/limits. PARTNER has no access. Design doc: `docs/COPY_TRADING_ARCHITECTURE.md`.

## 5. Phase 4 — MT5 / MetaAPI Hardening ✅
**What it does:** unblocked the build and made the broker layer real (read + execution) — kept safe-by-default.

- **Build blocker fixed:** installed `metaapi.cloud-sdk@29`; `serverExternalPackages:["metaapi.cloud-sdk"]` in `next.config.ts`; created the missing **`brokerCredentialService`** (decrypt/store) + **`brokerCrypto`** (AES-256-GCM, key derived via SHA-256, server-only).
- `MetaApiBrokerAdapter`: `verifyConnection/fetchSnapshot/fetchOpenTrades/fetchTradeHistory` + `openTrade/closeTrade/modifyTrade` against the **verified SDK API** (`createMarketBuyOrder/SellOrder`, `closePosition`, `modifyPosition`); success-code interpretation; typed errors.
- `broker_operation_logs` for traceable, secret-free diagnostics.
- Copy live bridge wired: gates → eligibility → lot → `adapter.openTrade` → per-follower SUCCESS/FAILED/SKIPPED log; idempotent (unique index on live success); **never faked**.

**Live safety switch:** `executionAvailable()` requires `METAAPI_TOKEN` **and** `BROKER_EXECUTION_ENABLED=true`. With the flag off, live copy returns `COPY_EXECUTION_NOT_CONFIGURED` — no orders placed.

## 6. Phase 4.5 — Performance / Production ✅
- Added partner `loading.tsx` + `error.tsx`; deferred the heavy `/admin/copy` accounts fetch until the create dialog opens; added the `notifications(user_id, created_at DESC)` index (011).
- Audit found the app already well-optimized: no `select('*')`, comprehensive indexes, `refetchOnWindowFocus:false`, charts already dynamic/SVG, no server-only bundle leaks.

## 7. Phase 4.6 — Background Worker / Job Queue ✅ (foundation only)
**What it does:** moves slow MetaAPI/copy work off request routes into a Supabase-backed queue with admin visibility and a manual worker run. **No cron auto-enabled; live execution still gated off.**

- `background_jobs` table + atomic `claim_background_jobs()` RPC (migration 012).
- `backgroundJobService.ts` (enqueue/enqueueUnique, claim, finalize, requeue, cancel, releaseStale, list/stats) + `workers/jobProcessor.ts` (`processJob` dispatch + `runWorkerOnce`).
- **Job types:** `SYNC_ACCOUNT`, `SYNC_ALL_CONNECTED_ACCOUNTS`, `MONITOR_COPY_STRATEGY`, `MONITOR_ALL_ACTIVE_COPY_STRATEGIES`, `SIMULATE_COPY_EVENT`, `SIMULATE_COPY_STRATEGY`, `EXECUTE_COPY_EVENT`, `RETRY_COPY_LOG`, `CLEANUP_STALE_JOBS`. *(The `JobType` union also reserves `SYNC_EVALUATION_ACCOUNT`, `CHECK_EVALUATION_ATTEMPT`, `CHECK_ALL_ACTIVE_EVALUATIONS` placeholders — no processors/handlers exist for these yet.)*
- **Statuses:** PENDING/RUNNING/SUCCESS/FAILED/SKIPPED/CANCELLED. Backoff 1m→5m→15m; gate blocks → SKIPPED (no retry); validation → FAILED (no retry); transient → FAILED (retry). Stale RUNNING released after `WORKER_STALE_JOB_MINUTES`.
- **Routes:** `POST /api/worker/jobs/{run,schedule}` (protected by `WORKER_SECRET`; prod requires it, dev allows an authenticated admin). Admin: `GET /api/admin/jobs`, `POST /api/admin/jobs/{enqueue,[id]/retry,[id]/cancel,run-now}`. Page `/admin/jobs` + nav (ADMIN, Clock icon).
- `EXECUTE_COPY_EVENT` reuses `executeCopyForEvent` so all live gates still apply (SKIPPED when disabled). Payloads hold **IDs only**; results hold counts/summaries — no secrets in jobs/logs/UI.
- Existing `/admin/copy` manual buttons untouched (queue actions added on `/admin/jobs`). Docs: `docs/BACKGROUND_WORKER.md`.

---

## 8. Full route map
**Trader:** `/dashboard`, `/accounts`, `/accounts/[id]`, `/trades`, `/analytics`, `/risk`, `/ai`, `/copy-trading`, `/reports`, `/settings`
**Admin:** `/admin`, `/admin/users`, `/admin/traders`, `/admin/accounts`, `/admin/crm`, `/admin/risk`, `/admin/copy`, `/admin/jobs`, `/admin/ai`, `/admin/economic-calendar`, `/admin/subscriptions`, `/admin/audit`
**Partner:** `/partner`, `/partner/traders`, `/partner/crm`, `/partner/commissions`
**Auth:** `/login`, `/register`, `/forgot-password`, `/reset-password`

---

## 9. Test users (seeded)
| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | `admin@aurix.local` | `Password123!` | |
| Trader | `trader@aurix.local` | `Password123!` | demo account + trades + snapshots |
| Partner | `partner@aurix.local` | `Password123!` | trader assigned, 2 commission records, referral `DEMOPA-6RDDA` |

Seed scripts (run with `npx tsx`): `scripts/seed-trader-demo.ts`, `scripts/seed-partner-demo.ts`, `scripts/reset-users.ts`.

---

## 10. Environment variables
`.env.local` holds real values (do not commit). Status:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD` — set ✅
- `GEMINI_API_KEY` — set ✅ · `AI_DEFAULT_MODEL`/`AI_CHART_MODEL` = `gemini-2.5-flash`
- `ENCRYPTION_KEY` — needed before storing broker credentials
- `METAAPI_TOKEN` — **not set** (needed for live MT5 sync/execution) · `METAAPI_RELIABILITY=regular` · `BROKER_PROVIDER=metaapi`
- `BROKER_EXECUTION_ENABLED=false` — **live copy master switch; keep false until demo-verified**
- `WORKER_SECRET` — **not set**; required in prod to call `/api/worker/jobs/*` (`x-worker-secret` header). `WORKER_MAX_JOBS_PER_RUN=5` (cap 20), `WORKER_STALE_JOB_MINUTES=15` — optional defaults.

For Vercel (prod + preview): set all of the above; generate a long random `WORKER_SECRET`; keep `BROKER_EXECUTION_ENABLED=false` until tested on a demo account.

---

## 11. How to verify
```
npm run test        # 107 passing
npm run build       # passes (~12s compile)
npm run migrate     # migrations 007–012 idempotent/applied
npm run dev         # log in as the three test users
```
Manual smoke: AI chat → real account context (no Gemini branding); partner sees only its trader; copy simulate → calculated lots; Execute with flag off → `COPY_EXECUTION_NOT_CONFIGURED`; emergency stop blocks; partner blocked from `/admin` & `/copy-trading`; `/admin/jobs` → Queue sync/monitor all → Run worker now → statuses update; trader/partner cannot reach `/admin/jobs` or worker routes; no secrets in any network response.

---

## 12. Known gaps / risks for the next agent
1. **Live copy execution is UNVERIFIED against a real broker** — implemented from SDK types, gated behind `BROKER_EXECUTION_ENABLED` + all in-app gates. Must be tested on a **demo MT5 account** before enabling.
2. **Worker is a foundation, not yet automatic** — no cron enabled; jobs process only on admin "Run worker now" or an external scheduler hitting `/api/worker/jobs/run` with `WORKER_SECRET`. Each run is bounded (~55s). For production scale, move to a dedicated long-running worker (pg-boss/BullMQ/Inngest/Trigger.dev/VPS) polling `claim_background_jobs()`. See `docs/BACKGROUND_WORKER.md`.
3. **No broker-credential connect flow/UI** — `storeBrokerCredentials` exists but nothing calls it yet; needed to connect a demo account end-to-end.
4. **CLOSE/MODIFY copy not implemented** (no master→follower position mapping) — OPEN only.
5. **Reserved evaluation job types** (`SYNC_EVALUATION_ACCOUNT`, `CHECK_EVALUATION_ATTEMPT`, `CHECK_ALL_ACTIVE_EVALUATIONS`) are declared in `JobType` but have **no processor logic** — they'll fall through to "unknown job type" if enqueued.
6. **Pre-existing:** `tests/unit/riskEvaluation.test.ts` has 2 `as any`→SupabaseClient cast errors under `tsc` (test-only). `crmService.ts:26` has a pre-existing `as any` lint warning. ~22 npm vulnerabilities from the metaapi dependency tree — review before production.

---

## 13. Recommended next step
The worker **foundation** is done. Next: (1) build a demo broker-credential connect flow (route/UI calling `storeBrokerCredentials`), (2) verify sync → monitor → simulate → single gated execute on a **demo MT5 account**, (3) move processing to a dedicated worker/queue for scale, then enable Vercel Cron (config in `docs/BACKGROUND_WORKER.md`, once `WORKER_SECRET` is set) before flipping `BROKER_EXECUTION_ENABLED`.

## 14. Key docs
- `docs/COPY_TRADING_ARCHITECTURE.md` — copy trading design
- `docs/BACKGROUND_WORKER.md` — queue design, job types, gates, cron config, production path
- `AURIX_FOR_CHATGPT.txt` — original full-platform context primer
