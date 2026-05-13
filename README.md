# Trading Platform

Full-stack fintech trading platform scaffold for trader dashboards, CRM, admin oversight, analytics, risk monitoring, broker adapters, and realtime account updates.

## Getting Started

```bash
npm.cmd install
npm.cmd run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Current State

- Responsive dashboard UI with client-approved black/yellow/lime direction.
- Shared domain types and deterministic mock data.
- Mock-backed service and API route boundaries.
- Prisma schema and seed entrypoint.
- Broker adapter contract with mock and MetaApi-ready implementations.
- Realtime event contract for future Socket.IO gateway.

## Useful Scripts

```bash
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run prisma:generate
npm.cmd run prisma:migrate
npm.cmd run prisma:seed
```

## Docs

- `docs/requirements-summary.md`
- `docs/database-model.md`
- `docs/deployment.md`

## Notes

The app currently uses deterministic mock data so the client can review UI and route structure before database credentials and broker credentials are available.
