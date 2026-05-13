# Deployment Notes

## Required Services

- Node.js runtime for Next.js.
- PostgreSQL database.
- Redis for future cache, queues, and rate limiting.
- Broker provider credentials when live account sync is enabled.

## Commands

```powershell
npm.cmd install
npm.cmd run prisma:generate
npm.cmd run prisma:migrate -- --name init
npm.cmd run prisma:seed
npm.cmd run build
npm.cmd run start
```

## Environment

Copy `.env.example` to `.env.local` for local development, then fill database and broker values.

## Realtime

The current project defines shared realtime event names and Socket.IO boundaries. Production deployment should run the WebSocket gateway on a stable Node runtime and point `NEXT_PUBLIC_REALTIME_URL` to that gateway.
