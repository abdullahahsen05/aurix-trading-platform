-- ============================================================
-- AURIX Trading Platform — Supabase Schema Migration 012
-- Phase 4.6: Background worker / job queue for MT5 sync + copy trading.
-- Additive + idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type              TEXT NOT NULL CHECK (type IN (
                      'SYNC_ACCOUNT',
                      'SYNC_ALL_CONNECTED_ACCOUNTS',
                      'MONITOR_COPY_STRATEGY',
                      'MONITOR_ALL_ACTIVE_COPY_STRATEGIES',
                      'SIMULATE_COPY_EVENT',
                      'SIMULATE_COPY_STRATEGY',
                      'EXECUTE_COPY_EVENT',
                      'RETRY_COPY_LOG',
                      'CLEANUP_STALE_JOBS'
                    )),
  status            TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','RUNNING','SUCCESS','FAILED','CANCELLED','SKIPPED')),
  priority          INTEGER NOT NULL DEFAULT 100,
  run_after         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts          INTEGER NOT NULL DEFAULT 0,
  max_attempts      INTEGER NOT NULL DEFAULT 3,
  -- A natural key for de-duplicating queued work (e.g. "MONITOR_COPY_STRATEGY:<id>").
  unique_key        TEXT,
  locked_at         TIMESTAMPTZ,
  locked_by         TEXT,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,
  last_error_code   TEXT,
  last_error_message TEXT,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  result            JSONB,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Claim ordering + dashboards.
CREATE INDEX IF NOT EXISTS idx_bg_jobs_claim
  ON public.background_jobs(status, run_after, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_bg_jobs_type_created
  ON public.background_jobs(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bg_jobs_created
  ON public.background_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bg_jobs_running
  ON public.background_jobs(locked_at)
  WHERE status = 'RUNNING';
-- De-dupe only among not-yet-finished jobs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bg_jobs_unique_active
  ON public.background_jobs(unique_key)
  WHERE unique_key IS NOT NULL AND status IN ('PENDING','RUNNING');

CREATE OR REPLACE TRIGGER trg_background_jobs_updated_at
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Atomic claim: lock + flip PENDING → RUNNING for the worker. ──────────────
-- FOR UPDATE SKIP LOCKED guarantees two concurrent workers never grab the same
-- job. attempts increments on claim. Called via the service-role client only.
CREATE OR REPLACE FUNCTION public.claim_background_jobs(
  p_worker TEXT,
  p_limit  INTEGER,
  p_types  TEXT[] DEFAULT NULL
)
RETURNS SETOF public.background_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.background_jobs j
  SET status = 'RUNNING',
      locked_at = NOW(),
      locked_by = p_worker,
      started_at = NOW(),
      attempts = j.attempts + 1,
      updated_at = NOW()
  WHERE j.id IN (
    SELECT c.id FROM public.background_jobs c
    WHERE c.status = 'PENDING'
      AND c.run_after <= NOW()
      AND (p_types IS NULL OR c.type = ANY(p_types))
    ORDER BY c.priority ASC, c.run_after ASC, c.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 0)
  )
  RETURNING j.*;
END;
$$;

-- ── RLS — admin only (traders/partners never read the queue). ───────────────
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "background_jobs_admin_all"
  ON public.background_jobs FOR ALL
  USING (public.is_admin());
