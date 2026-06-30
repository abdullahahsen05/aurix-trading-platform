-- ============================================================
-- AURIX Trading Platform — Supabase Schema Migration 011
-- Phase 4.5: Performance — targeted index for the notification feed.
-- Additive + idempotent. (Most hot-path indexes already exist in 006/008/009/010.)
-- ============================================================

-- The Topbar notification feed polls listNotifications(userId) every 30s for
-- every signed-in user: filter user_id, order created_at DESC. The existing
-- idx_notifications_user (user_id) narrows rows but does not serve the sort.
-- This composite serves both in one index.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
