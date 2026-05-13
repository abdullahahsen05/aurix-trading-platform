# Database Model

The database is normalized for write-heavy trading data and uses derived summaries for read-heavy dashboard views.

## Core Tables

- `users`: identity, role, and status.
- `trader_profiles`: trader CRM profile and segmentation.
- `trading_accounts`: broker account metadata and connection state.
- `broker_credentials`: encrypted credential reference only.
- `account_snapshots`: balance, equity, floating PnL, drawdown time series.
- `trades`: open and closed trades.
- `daily_account_metrics`: dashboard analytics cache by day.
- `risk_rules`: platform or account risk thresholds.
- `risk_events`: warning and violation history.
- `crm_notes` and `crm_activities`: admin CRM timeline.
- `subscriptions`: plan and entitlement records.
- `notifications`: user-facing alerts.
- `audit_logs`: sensitive admin/system actions.

## Read Strategy

Dashboard routes should prefer `daily_account_metrics` and the latest `account_snapshots`. Do not recompute long trade histories on every request.

## Credential Rule

Never store raw broker credentials. Store an encrypted reference or secret-provider pointer.
