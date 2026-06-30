-- ============================================================
-- AURIX Trading Platform — Supabase Schema Migration 007
-- Phase 1: White-Label AI Trading Assistant
-- Adds: economic_calendar_events, ai_usage_logs, ai_user_limits
-- Additive only — safe to apply to existing data
-- ============================================================

-- ── ECONOMIC_CALENDAR_EVENTS ────────────────────────────────
-- Internal economic calendar. Read by any active authenticated user
-- (used for AI news-context). Managed (write) by admins only.
CREATE TABLE IF NOT EXISTS public.economic_calendar_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  country_code  TEXT,
  currency      TEXT NOT NULL,
  impact        TEXT NOT NULL DEFAULT 'LOW'
                CHECK (impact IN ('LOW', 'MEDIUM', 'HIGH')),
  event_time    TIMESTAMPTZ NOT NULL,
  actual        TEXT,
  forecast      TEXT,
  previous      TEXT,
  source        TEXT,
  description   TEXT,
  category      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_economic_calendar_currency_time
  ON public.economic_calendar_events(currency, event_time);
CREATE INDEX IF NOT EXISTS idx_economic_calendar_event_time
  ON public.economic_calendar_events(event_time);

CREATE OR REPLACE TRIGGER trg_economic_calendar_events_updated_at
  BEFORE UPDATE ON public.economic_calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── AI_USAGE_LOGS ───────────────────────────────────────────
-- Metadata-only usage ledger for rate limiting + admin analytics.
-- NEVER stores prompts, AI responses, credentials, keys, or account payloads.
-- Writes happen exclusively via the service-role admin client (RLS bypassed),
-- so there is no client-facing INSERT policy — mirrors audit_logs.
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  route             TEXT NOT NULL CHECK (route IN ('chat', 'chart-analysis')),
  model             TEXT NOT NULL,
  request_type      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'SUCCESS'
                    CHECK (status IN ('SUCCESS', 'FAILED')),
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  total_tokens      INTEGER,
  estimated_cost    NUMERIC(12,6),
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_created
  ON public.ai_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_route_created
  ON public.ai_usage_logs(route, created_at DESC);

-- ── AI_USER_LIMITS ──────────────────────────────────────────
-- Per-user overrides for AI daily limits + global enable/disable.
-- NULL limit columns mean "fall back to the env default".
CREATE TABLE IF NOT EXISTS public.ai_user_limits (
  user_id            UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_daily_limit   INTEGER,
  chart_daily_limit  INTEGER,
  ai_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_user_limits_user
  ON public.ai_user_limits(user_id);

CREATE OR REPLACE TRIGGER trg_ai_user_limits_updated_at
  BEFORE UPDATE ON public.ai_user_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── ROW LEVEL SECURITY ──────────────────────────────────────
ALTER TABLE public.economic_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_user_limits           ENABLE ROW LEVEL SECURITY;

-- ECONOMIC_CALENDAR_EVENTS: any active user can read; admins manage.
CREATE POLICY "economic_calendar_select"
  ON public.economic_calendar_events FOR SELECT
  USING (public.is_active_user() OR public.is_admin());

CREATE POLICY "economic_calendar_admin_write"
  ON public.economic_calendar_events FOR ALL
  USING (public.is_admin());

-- AI_USAGE_LOGS: a user reads their own rows; admins read all.
-- No INSERT policy — writes are service-role only.
CREATE POLICY "ai_usage_logs_select_own_or_admin"
  ON public.ai_usage_logs FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- AI_USER_LIMITS: a user reads their own limit row; admins read/write all.
CREATE POLICY "ai_user_limits_select_own_or_admin"
  ON public.ai_user_limits FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "ai_user_limits_admin_write"
  ON public.ai_user_limits FOR ALL
  USING (public.is_admin());
