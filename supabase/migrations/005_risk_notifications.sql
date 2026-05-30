-- ============================================================
-- AURIX Trading Platform — Supabase Schema Migration 005
-- Phase 6: Risk engine + notification infrastructure
-- Additive only — safe to apply to existing data
-- ============================================================

-- Add type column to categorise notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT
  CHECK (type IN ('RISK_EVENT', 'SYNC_SUCCESS', 'SYNC_FAILURE'));

-- Link notification to the risk event that caused it (used for dedup)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS risk_event_id UUID
  REFERENCES public.risk_events(id) ON DELETE SET NULL;

-- Prevent duplicate *active* events for the same account+rule at the DB level.
-- The application checks first; this index is a safety net.
CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_events_active_dedup
  ON public.risk_events(trading_account_id, rule_name)
  WHERE acknowledged_at IS NULL;

-- Fast lookup: "does a notification already exist for this risk_event_id?"
CREATE INDEX IF NOT EXISTS idx_notifications_risk_event
  ON public.notifications(risk_event_id)
  WHERE risk_event_id IS NOT NULL;

-- Fast unread-count query
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read_at)
  WHERE read_at IS NULL;
