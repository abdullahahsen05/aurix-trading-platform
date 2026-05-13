# Requirements Summary

This project is a full-stack fintech trading platform for trader dashboards, CRM, admin oversight, analytics, realtime account monitoring, and broker integration.

## MVP Scope

- Trader dashboard with challenge metrics, account performance, risk status, open trades, and trade history.
- Admin CRM views for trader profiles, notes, segmentation, account supervision, subscriptions, and audit logs.
- Shared TypeScript DTOs used by UI, services, APIs, tests, and seed data.
- PostgreSQL schema through Prisma with normalized trading/account/CRM/risk records.
- Mock broker adapter now, MetaApi-ready adapter boundary for later credentials.
- Realtime event contract for balance, equity, trade, risk, and notification updates.

## Known External Inputs Needed

- Behance/reference URL or final design board if client wants exact visual matching.
- Broker API credentials, MetaApi token, MT5 account/server details, and investor password flow.
- Payment provider decision before real subscription billing.
- Deployment target and managed Redis/Postgres provider details.

## Deferred Scope

- Live MT5 verification until credentials arrive.
- Payment capture.
- AI suggestions, copy trading, bots, affiliate/referral system, and native mobile app.
