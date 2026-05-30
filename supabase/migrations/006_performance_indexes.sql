-- supabase/migrations/006_performance_indexes.sql
-- ============================================================
-- AURIX Trading Platform — Supabase Schema Migration 006
-- Phase 7: Performance indexes + account summary views
-- Additive only — safe to apply to existing data
-- ============================================================

-- ── Views ──────────────────────────────────────────────────────────────────
-- Both views use security_invoker = true (Postgres 15+) so they execute in
-- the calling session's security context. When called via the Supabase SSR
-- client (trader JWT), the underlying tables' RLS policies apply — traders
-- see only their own accounts' snapshots/trades. When called via the admin
-- service-role client, RLS is bypassed as normal.

-- Latest snapshot per account (DISTINCT ON is index-efficient for this pattern)
CREATE OR REPLACE VIEW public.latest_account_snapshots
  WITH (security_invoker = true)
AS
  SELECT DISTINCT ON (trading_account_id)
    id,
    trading_account_id,
    balance,
    equity,
    floating_pnl,
    drawdown_percent,
    captured_at
  FROM public.account_snapshots
  ORDER BY trading_account_id, captured_at DESC;

-- Open trade count per account (replaces per-account COUNT queries)
-- Note: accounts with no open trades have no row — always default to 0 when joining
CREATE OR REPLACE VIEW public.account_open_trade_counts
  WITH (security_invoker = true)
AS
  SELECT
    trading_account_id,
    count(*)::int AS open_trade_count
  FROM public.trades
  WHERE status = 'OPEN'
  GROUP BY trading_account_id;

-- ── New performance indexes ────────────────────────────────────────────────

-- trading_accounts: sort by last sync time DESC in admin supervision
-- (idx_trading_accounts_last_synced from migration 004 covers ASC; this adds DESC)
CREATE INDEX IF NOT EXISTS idx_trading_accounts_last_synced_desc
  ON public.trading_accounts(last_synced_at DESC)
  WHERE last_synced_at IS NOT NULL;

-- trading_accounts: MetaAPI lookup by provider account ID
-- idx_trading_accounts_provider_account_id from migration 004 already covers this

-- trades: closed_at filter for daily PnL and analytics closed-trade queries
CREATE INDEX IF NOT EXISTS idx_trades_account_closed
  ON public.trades(trading_account_id, closed_at DESC)
  WHERE closed_at IS NOT NULL;

-- risk_events: open queue filter (acknowledged_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_risk_events_open_queue
  ON public.risk_events(trading_account_id, created_at DESC)
  WHERE acknowledged_at IS NULL;

-- notifications: sort by created_at per user (list + Topbar feed)
-- idx_notifications_user_created from migration 003 already covers this

-- audit_logs: filter by actor + sort (admin audit page)
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
  ON public.audit_logs(actor_user_id, created_at DESC);

-- audit_logs: entity lookup with created_at sort (admin entity drill-down)
-- (idx_audit_logs_entity from migration 003 covers entity_type+entity_id only;
--  this wider version adds created_at DESC for time-ordered entity queries)
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created
  ON public.audit_logs(entity_type, entity_id, created_at DESC);

-- crm_notes: trader timeline
CREATE INDEX IF NOT EXISTS idx_crm_notes_trader_created
  ON public.crm_notes(trader_profile_id, created_at DESC);

-- crm_activities: trader activity timeline
CREATE INDEX IF NOT EXISTS idx_crm_activities_trader_created
  ON public.crm_activities(trader_profile_id, created_at DESC);

-- subscriptions: lookup per trader + filter by status (admin subscriptions page)
-- idx_subscriptions_trader from migration 003 already covers this

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions(status);

-- profiles: admin user filter by role + status
CREATE INDEX IF NOT EXISTS idx_profiles_role_status
  ON public.profiles(role, status);

-- ── View grants ────────────────────────────────────────────────────────────
-- Grant SELECT on views to authenticated role so RLS-respecting trader
-- queries can read these views via the Supabase client.
GRANT SELECT ON public.latest_account_snapshots TO authenticated;
GRANT SELECT ON public.account_open_trade_counts TO authenticated;
