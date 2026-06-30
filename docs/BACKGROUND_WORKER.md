# Aurix Background Worker / Job Queue (Phase 4.6)

A Supabase-backed job queue that moves slow MetaAPI/copy work off request routes.
**This phase ships the foundation + manual run only — no cron is auto-enabled and
live trading stays disabled by default.**

## Why
MetaAPI deploy/connect/sync can take minutes; serverless request routes time out.
The queue lets an admin (or, later, Vercel Cron) enqueue work and a bounded worker
pass process it safely with retries, idempotency, and admin visibility.

## Pieces
- **Table:** `background_jobs` (migration `012_background_jobs.sql`) + atomic
  `claim_background_jobs()` Postgres function (`FOR UPDATE SKIP LOCKED`).
- **Service:** `src/lib/services/backgroundJobService.ts` — enqueue / claim /
  finalize / requeue / cancel / releaseStale / list / stats.
- **Processor:** `src/lib/workers/jobProcessor.ts` — `processJob()` dispatch +
  `runWorkerOnce()` (claim → process → finalize, one bounded pass).
- **Worker routes:** `POST /api/worker/jobs/run`, `POST /api/worker/jobs/schedule`
  (protected by `WORKER_SECRET`).
- **Admin routes:** `GET /api/admin/jobs`, `POST /api/admin/jobs/enqueue`,
  `/[id]/retry`, `/[id]/cancel`, `/run-now`.
- **Admin UI:** `/admin/jobs`.

## Job types
`SYNC_ACCOUNT`, `SYNC_ALL_CONNECTED_ACCOUNTS`, `MONITOR_COPY_STRATEGY`,
`MONITOR_ALL_ACTIVE_COPY_STRATEGIES`, `SIMULATE_COPY_EVENT`,
`SIMULATE_COPY_STRATEGY`, `EXECUTE_COPY_EVENT`, `RETRY_COPY_LOG`,
`CLEANUP_STALE_JOBS`. Fan-out jobs (`*_ALL_*`) enqueue one child job per
account/strategy rather than doing all the work in one job.

## Statuses & retries
`PENDING → RUNNING → SUCCESS | FAILED | SKIPPED | CANCELLED`. `attempts`
increments on claim. FAILED reschedules with backoff (1m → 5m → 15m) while
`attempts < max_attempts`; otherwise terminal. **Gate blocks
(live disabled / emergency stop / not configured / consent / not eligible) →
SKIPPED, no retry.** Validation errors → FAILED, no retry. Transient/provider
errors → FAILED with retry. Stale RUNNING jobs are released by
`CLEANUP_STALE_JOBS` after `WORKER_STALE_JOB_MINUTES`.

## Safety gates (unchanged — enforced inside the existing services)
`EXECUTE_COPY_EVENT` calls `executeCopyForEvent`, which still requires:
`BROKER_EXECUTION_ENABLED=true` → global live copy → emergency stop off →
strategy LIVE + live_enabled → follower ACTIVE → consent → account CONNECTED →
not RESTRICTED → risk/eligibility → valid lot → idempotency. With the env flag
off, the job ends **SKIPPED** with `COPY_EXECUTION_NOT_CONFIGURED` — no order,
no fake success. Simulation jobs never touch broker execution.

## Security
- Worker routes require `x-worker-secret` === `WORKER_SECRET` (prod refuses if unset;
  dev allows an authenticated admin).
- Admin routes use `requireAdmin()`. Traders/partners cannot read the queue (RLS
  admin-only + admin-gated routes).
- Payloads contain **IDs only**. No credentials, tokens, or decrypted secrets are
  stored in `payload`/`result` or logs. Results hold counts/summaries only.

## Env vars
| Var | Where | Notes |
|---|---|---|
| `WORKER_SECRET` | `.env.local`, Vercel prod + preview | long random string; required in prod |
| `WORKER_MAX_JOBS_PER_RUN` | optional (default 5) | per-run batch size; capped at 20 |
| `WORKER_STALE_JOB_MINUTES` | optional (default 15) | stale-running release threshold |

## Local testing
```
npm run migrate                 # applies 012
npm run dev
# Admin → /admin/jobs → "Queue sync all" / "Queue monitor all" → "Run worker now"
# or, in dev (no WORKER_SECRET), as an authenticated admin:
curl -XPOST http://localhost:3000/api/worker/jobs/run -H 'content-type: application/json' -d '{"limit":5}'
```

## Cron (NOT enabled in this phase — recommended config)
Add to `vercel.json` only when you intend to enable scheduling, and set
`WORKER_SECRET`. Vercel Cron cannot send custom headers on all plans; if yours
can, point it at the routes; otherwise use an external scheduler (GitHub Actions,
cron-job.org) that sends the `x-worker-secret` header.
```jsonc
{
  "crons": [
    { "path": "/api/worker/jobs/schedule", "schedule": "*/10 * * * *" }, // enqueue fan-out every 10m
    { "path": "/api/worker/jobs/run",      "schedule": "*/2 * * * *"  }  // process a batch every 2m
  ]
}
```
Keep frequencies conservative to avoid MetaAPI rate/billing spikes. **Do not
schedule live execution automatically** — keep `EXECUTE_COPY_EVENT` admin-initiated
until you have run a full demo verification.

## Production limitations / recommended future worker
Serverless still bounds each run (~55s processor timeout here). For real live
copy at scale, move processing to a dedicated long-running worker / queue service
(pg-boss, BullMQ, Inngest, Trigger.dev, or a small VPS worker) that polls
`claim_background_jobs()` continuously. The data model + service already support
this — only the runner changes.
