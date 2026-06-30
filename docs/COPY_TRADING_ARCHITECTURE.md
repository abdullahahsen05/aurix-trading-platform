# Aurix Copy Trading — Architecture (Phase 3)

> **Status:** Simulation-first. Live execution is **disabled by default** and currently
> **not wired to a broker** (MetaAPI order execution is not implemented — see §12).
> Live routes are fully gated and return `COPY_EXECUTION_NOT_CONFIGURED` rather than
> faking success.

## 1. Concepts

| Concept | Meaning |
|---|---|
| **Master account** | A company-controlled `trading_accounts` row whose trades drive a strategy. |
| **Strategy** (`copy_strategies`) | Links a master account to followers; holds mode (SIMULATION/LIVE), live flag, and default risk/scaling. |
| **Follower account** | A trader-owned `trading_accounts` row that has **opted in** to a strategy. |
| **Copy subscription** (`copy_strategy_followers`) | The opt-in record: status, consent, per-follower risk/scaling overrides. |
| **Master trade event** (`copy_master_events`) | A normalized OPEN/CLOSE/MODIFY detected on the master account, deduped. |
| **Follower copy order** | A simulated or live instruction derived from a master event for one follower. |
| **Execution log** (`copy_execution_logs`) | One row per follower per master event: SIMULATION or LIVE, with status/lot/error. |

## 2. Data flow

```
master account trade detected (monitor)
  → event normalized + deduped → copy_master_events
  → (simulate or execute requested by admin)
      → load ACTIVE followers for strategy
      → per follower: eligibility + risk checks
      → calculate follower lot (scaling + clamp)
      → SIMULATION: write copy_execution_logs(mode=SIMULATION)
        LIVE: re-check all gates → broker.openTrade/closeTrade → log result
      → audit + (optional) notification
```

Monitoring is **manual/admin-triggered** (no background worker exists in this codebase;
the only existing sync trigger is `/api/trader/sync-trades`). This is intentional for
safety — nothing copies automatically.

## 3. Master account model
A company-controlled account, referenced by `copy_strategies.master_account_id →
trading_accounts(id)`. Monitoring reads the master account's `trades` rows (the same
table MetaAPI sync would populate) and diffs them against previously recorded
`copy_master_events` to emit OPEN/CLOSE/MODIFY. When live MetaAPI sync is implemented,
the master's trades populate the same way and monitoring is unchanged.

## 4. Follower account model
Trader-owned account + a `copy_strategy_followers` row. Requires explicit opt-in and
consent. Per-follower settings (scaling mode, risk multiplier, fixed lot, max lot, max
open trades, max daily-loss %, max drawdown %, symbol allow/block) override strategy
defaults.

## 5. Trade event model (`copy_master_events`)
`event_type` (OPEN/CLOSE/MODIFY), `master_trade_id`, `symbol`, `side`, `volume`,
`open_price`, `close_price`, `stop_loss`, `take_profit`, `event_time`, `raw_payload`
(jsonb), and a **`dedupe_key`** (unique) = `strategyId:masterTradeId:eventType:version`
so the same event is never recorded twice.

## 6. Lot scaling

Modes: `FIXED_MULTIPLIER`, `BALANCE_PROPORTIONAL`, `EQUITY_PROPORTIONAL`, `FIXED_LOT`.

```
EQUITY_PROPORTIONAL:  followerLot = masterLot * (followerEquity / masterEquity) * riskMultiplier
BALANCE_PROPORTIONAL: followerLot = masterLot * (followerBalance / masterBalance) * riskMultiplier
FIXED_MULTIPLIER:     followerLot = masterLot * riskMultiplier
FIXED_LOT:            followerLot = fixedLot
```

Then: `followerLot = clamp(roundToStep(followerLot, lotStep), minLot, maxLot)`.

Guards: missing/zero/negative equity or balance → proportional modes yield `0`
(→ `COPY_INVALID_LOT`, logged SKIPPED), never a divide-by-zero or negative lot.
Defaults: `lotStep=0.01`, `minLot=0.01`, `maxLot` from follower/strategy.

## 7. Risk limits
Global kill switch (`copy_global_settings.emergency_stop_enabled`), global live enable
(`live_copy_enabled`), per-strategy `live_enabled`, per-follower opt-in/consent/pause,
max lot, max open copied trades, max symbol exposure (via allow/block lists), max
drawdown stop, max daily-loss stop.

## 8. Failure handling
- Broker disconnected / account not CONNECTED → SKIPPED (eligibility).
- Insufficient margin / invalid symbol / market closed / slippage → FAILED with
  `error_code`/`error_message` from the provider (never suppressed).
- Duplicate event → ignored via `dedupe_key`.
- Duplicate live order to same follower → blocked via logical key
  (`master_event_id + follower_account_id + action`); existing SUCCESS short-circuits.
- Retries: **no automatic retry loops.** A FAILED live log may be retried **only** by an
  explicit admin action, and only for transient errors. Every attempt is a new log row.

## 9. Consent / legal
Traders must explicitly opt in and accept a risk disclaimer (`consent_accepted_at`).
The UI shows that trading carries risk and that there are **no guaranteed profits**.
Traders can pause or revoke at any time. No copying occurs without `status=ACTIVE` +
consent.

## 10. Audit logging
Audited via the existing `auditService`: strategy created/updated, live mode enabled,
global live toggled, kill switch toggled, follower opted-in/paused/revoked, live order
attempted/succeeded/failed, emergency stop.

## 11. Security
All permission + risk checks are **backend-enforced**. Broker credentials and MetaAPI
tokens never reach the client. Copy tables are written only via the server/admin client.
RLS: admins manage all; traders read only their own follower rows + logs; **PARTNER has
no access** in this phase. Trader routes use `requireTrader()` and only touch the
trader's own accounts.

## 12. Live execution status & remaining work
MetaAPI order execution does **not** exist yet (`MetaApiBrokerAdapter` throws for all
methods; `metaapi.cloud-sdk` is not installed; `brokerSyncService` references a missing
`brokerCredentialService` — the current `next build` blocker, pre-existing and unrelated
to copy trading). Therefore:
- The `BrokerAdapter` interface gains `openTrade/closeTrade/modifyTrade`.
- `MetaApiBrokerAdapter` implements them as **guarded stubs** that throw
  `BrokerConfigurationError` (surfaced as `COPY_EXECUTION_NOT_CONFIGURED`).
- The live-execute route enforces every gate, then attempts the adapter call; with no
  configured provider it returns `COPY_EXECUTION_NOT_CONFIGURED` and logs FAILED — it
  **never fabricates a broker order id**.

**To go live later:** install + wire `metaapi.cloud-sdk`, implement
`brokerCredentialService` (decrypt stored credentials), implement the three execution
methods in `MetaApiBrokerAdapter`, then flip the global + strategy live flags in a demo
environment and test with one event before enabling broadly.
