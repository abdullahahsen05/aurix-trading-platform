# Aurix — Full Implementation & Test Report

**Snapshot:** Next.js 16 + Supabase + RBAC platform, 8 feature modules. **Build ✅ (134 pages) · 266 tests ✅ (22 files).**

Legend: 🟢 working now · 🟡 wired but needs config/credentials · 🔴 unverified against a live provider / stubbed

---

## Module-by-module

### 1. AI Trading Assistant — 🟢 working (verified live)
Chat + chart analysis grounded in real trader data, admin usage controls, economic-calendar news context. Rate-limited, server-only keys. **Tested live with a real Gemini key.** Only caveat: free-tier model (`gemini-2.5-flash` for both chat & chart).

### 2. Partner Dashboard — 🟢 working
Partner role, attribution (assignment + referral), scoped analytics/CRM/commissions ledger. Fully DB-backed, RLS + per-query `partner_id` scoping, partner isolation in proxy. Tested for scoping + RBAC.

### 3. Copy Trading — 🟢 simulation / 🔴 live (see deep-dive below)

### 4. MT5 / MetaAPI — 🟡 wired, 🔴 unverified (see deep-dive below)

### 5. Bot Marketplace — 🟢 logic / 🟡 verification flow
Bot products, MT5 account-locked license keys, public verification API, my-bots, admin management. License key generation + verification have unit tests (`botLicenseKey`, `botLicenseVerification`, `marketplaceAccess`). **Needs testing:** end-to-end purchase→license→MT5-lock→public-verify, and that a license truly binds to an MT5 account id.

### 6. Academy (LMS) — 🟢 working (DB-backed)
Courses/lessons/modules, trader progress, certificates, admin authoring. No external deps → should work fully on seeded data. **Needs testing:** progress calculation, certificate issuance, course-gating.

### 7. Evaluations & Certification — 🟢 logic / 🟡 needs MT5 data
Evaluation programs (profit target / daily + overall drawdown / min days / duration), rules engine (unit-tested: `evaluationRulesEngine`), admin-linked demo accounts. **Depends on account metrics** → fully meaningful only once MT5 sync feeds real equity/trades. Rules math is tested in isolation.

### 8. Institutional Terminal — 🟢 mock / 🔴 dxFeed unverified
Provider abstraction (`mock` default + `dxfeed`), candle chart, DOM/heatmap/volume-profile, macro/news, admin provider checklist, server-side dxFeed proxy routes. **Works in mock/demo mode now.** dxFeed is wired but needs `DXFEED_*` env (IPF/feed/scanner/news paths + auth) and is **untested against real dxFeed**.

---

## 🔬 DEEP DIVE: MT5 / MetaAPI (most critical, least verified)

### What's implemented
- **`brokerCredentialService`** 🟢 — AES-256-GCM encrypt/decrypt of MT5 login/password/server/platform; server-only; secret-safe. Unit-tested (`brokerCrypto`, `brokerCredentialApi`).
- **`brokerSyncService.syncTradingAccount`** 🟡 — full real flow: create/reuse MetaAPI cloud account → deploy → `waitConnected` → RPC connect → `getAccountInformation` + `getPositions` + `getDealsByTimeRange` → writes `account_snapshots` + upserts `trades` → marks CONNECTED. Has 50s timeout guard + sanitized errors.
- **`MetaApiBrokerAdapter`** 🟡 — `verifyConnection/fetchSnapshot/fetchOpenTrades/fetchTradeHistory` + `openTrade/closeTrade/modifyTrade` against the **verified SDK v29 API** (`createMarketBuyOrder/SellOrder`, `closePosition`, `modifyPosition`), with success-code interpretation.
- **`broker_operation_logs`** 🟢 — secret-free traceability.
- **Connect UI/routes** 🟡 — `BrokerConnectPanel` + `/api/trading-accounts/[id]/broker-credentials` (store) + `/sync` exist.
- **Build** 🟢 — SDK installed + externalized; no client bundle leak.

### What is NOT verified / blocking
- 🔴 **`METAAPI_TOKEN` is not set** → nothing can actually talk to MetaAPI yet.
- 🔴 **Zero runtime testing against a real or demo MT5 account.** Account provisioning, deploy/connect timing, the exact shapes of positions/deals, and order execution responses are all **assumed from SDK types**, never exercised.
- 🟡 **Serverless timeout risk** — first-time account deploy/connect can exceed minutes; the 50s guard returns "still pending" rather than completing. Real connects likely need the background worker / polling.

### MT5 test plan (must do on a **demo** MT5 account)
1. Set `METAAPI_TOKEN` + `ENCRYPTION_KEY`. Connect a demo account via `BrokerConnectPanel` → confirm credentials encrypt into `broker_credentials`.
2. Trigger sync → watch it create the MetaAPI account, deploy, connect, and populate `account_snapshots` + `trades`. Confirm `provider_account_id`, `last_synced_at` set, status CONNECTED.
3. Re-sync → confirm idempotent trade upserts (no dupes via `external_trade_id`).
4. Verify `broker_operation_logs` capture each step with **no secrets**.
5. Force failures (bad password, market closed) → confirm sanitized errors, status DISCONNECTED, no credential leakage.

---

## 🔬 DEEP DIVE: Copy Trading (most complex logic)

### What's implemented & working now (🟢, no MT5 needed)
- **Strategies / followers / master events / global settings** — full CRUD, RLS, kill switch.
- **Master monitoring** — diffs the master account's `trades` rows → records OPEN/CLOSE events, deduped. Works as soon as the master account has trades (seeded or synced).
- **Simulation engine** — loads active followers → eligibility checks → lot scaling → writes `copy_execution_logs` (SUCCESS/SKIPPED with reasons). **Never calls the broker.** Pure lot-scaling (4 modes, clamps, zero-equity guards) + eligibility are unit-tested (`copyLotScaling`, `copyEligibility`).
- **Background jobs** can run monitor/simulate/execute off the request path (manual run; no cron).

### Live execution (🔴 gated + unverified)
`executeCopyForEvent` enforces, in order: `BROKER_EXECUTION_ENABLED` → global live → emergency stop → strategy LIVE + live_enabled → follower ACTIVE → consent → CONNECTED → not RESTRICTED → eligibility → valid lot → **idempotency** (unique index on live SUCCESS). With the flag off it returns `COPY_EXECUTION_NOT_CONFIGURED` (verified). Per-follower failures are logged, never faked. **OPEN only** — CLOSE/MODIFY copy is not implemented (no master→follower position-id mapping).

### Copy test plan
1. **Simulation (now):** seed/connect a master with trades → Monitor → events appear → Simulate → verify calculated lots + skip reasons; confirm **no broker calls**.
2. **Eligibility matrix:** toggle consent/status/connected/symbol-block/limits → confirm correct SKIP reasons.
3. **Live (demo only, after MT5 verified):** set `BROKER_EXECUTION_ENABLED=true`, enable global+strategy live, one follower consented on a **demo** account → Execute one event → confirm a real demo order + SUCCESS log with broker order id.
4. **Idempotency:** re-execute same event → second attempt SKIPPED (no duplicate order).
5. **Kill switch:** enable emergency stop → execution blocked.
6. **Cross-follower failure isolation:** one bad follower fails, others still process.

---

## What needs testing across the platform (priority order)
1. 🔴 **MT5 sync end-to-end** on a demo account (everything else with real data depends on this).
2. 🔴 **Live copy execution** on a demo account (the highest-risk path).
3. 🟡 **Background worker** under real load (timeouts, retries, stale-release) — and decide on cron/dedicated worker.
4. 🟡 **Marketplace license MT5-locking** + public verify end-to-end.
5. 🟡 **Evaluations** against real synced metrics (drawdown/daily-loss/target breach detection).
6. 🟡 **dxFeed terminal** with real credentials (currently mock-only).
7. 🟢 **Regression**: AI, Partner, Academy on seeded data (should pass).

## Top production risks
1. **No live MT5/copy verification** — implemented from docs/types, never run against a broker. Keep `BROKER_EXECUTION_ENABLED=false` until demo-tested.
2. **No automated worker/cron** — sync/monitor/execute are manual; real-time copy needs a dedicated worker (design in `docs/BACKGROUND_WORKER.md`).
3. **Serverless timeouts** on MetaAPI provisioning.
4. **Secrets/config**: `METAAPI_TOKEN`, `ENCRYPTION_KEY`, `DXFEED_*`, `WORKER_SECRET` all unset.
5. ~22 npm vulnerabilities from the metaapi dependency tree.
6. CLOSE/MODIFY copy unimplemented.
