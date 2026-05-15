# AURIX Trading Platform

Full-stack fintech trading platform for trader dashboards, CRM, admin oversight, analytics, risk monitoring, broker adapters, and realtime account updates.

## Tech Stack

- **Next.js 16.2.6** (App Router, Turbopack) + **React 19** + **TypeScript 5**
- **Tailwind CSS v4** with custom design tokens (black/yellow/lime theme)
- **Prisma 7.8.0** — 14-model schema (users, accounts, trades, risk, CRM, audit)
- **Framer Motion** for page and item animations
- **Radix UI** for accessible dialogs and overlays
- **Vitest** for unit tests, **Playwright** for E2E (scaffold)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the trader workspace or [http://localhost:3000/admin](http://localhost:3000/admin) for the admin panel.

## Pages

### Trader
| Route | Description |
|---|---|
| `/dashboard` | Live KPI strip (sparklines, delta %), market sentiment bar, performance rings, trading chart |
| `/accounts` | Connected broker accounts with search, status filters, connect dialog |
| `/accounts/[id]` | Account detail — equity curve, open trades, snapshots |
| `/trades` | Trade ledger with searchable overlay |
| `/analytics` | Equity curve, drawdown meter, KPI dashboard, period switching |
| `/risk` | Risk rules, drawdown bars, warning events, limit settings |
| `/reports` | Export and schedule reports |
| `/settings` | Profile and broker connection preferences |

### Admin
| Route | Description |
|---|---|
| `/admin` | Platform overview — rings, equity curve, trader watchlist, risk queue, overlay tabs |
| `/admin/traders` | Trader CRM directory |
| `/admin/accounts` | All accounts under supervision |
| `/admin/risk` | Risk rule editor, account monitoring, moderation tools |
| `/admin/crm` | CRM notes, activity timeline, trader profiles |
| `/admin/users` | User management |
| `/admin/subscriptions` | Subscription management |
| `/admin/audit` | Audit log |

## Current State

- Polished UI across all 16 pages — black/yellow/lime design system.
- Dashboard with live-updating KPI cards (sparklines, % change, status), market sentiment strip, performance rings, and interactive overlay tabs.
- Sidebar with sticky positioning, left-border active indicator, and logout.
- Topbar with notification bell popover, account selector, and role switcher.
- Admin overview with platform-level performance rings (MRR, active traders, risk events) and drill-down overlays.
- Shared domain types, deterministic mock data, and mock-backed service layer.
- Prisma schema fully defined — 14 models with indexes, ready for migration.
- Broker adapter contract with mock and MetaApi-ready implementations.
- API route boundaries returning `ApiEnvelope<T>`.

## Useful Scripts

```bash
npm run lint
npm run test
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Docs

- `docs/requirements-summary.md`
- `docs/database-model.md`
- `docs/deployment.md`

## Notes

The app runs on deterministic mock data while Supabase credentials and MetaApi broker credentials are being provisioned. Backend implementation (auth, Prisma queries, Supabase Realtime, broker sync) is planned for the next phase.
