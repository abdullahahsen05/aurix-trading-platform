-- ============================================================
-- AURIX Trading Platform — Supabase Schema Migration 010
-- Phase 4: MT5 / MetaAPI integration hardening
-- Adds the broker-sync columns the sync service expects (originally intended
-- for the never-shipped migration 004) plus a broker operation log.
-- Additive + idempotent.
-- ============================================================

-- ── trading_accounts: MetaAPI linkage + sync status ─────────
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS provider_account_id TEXT;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS sync_error TEXT;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_trading_accounts_provider_account
  ON public.trading_accounts(provider_account_id)
  WHERE provider_account_id IS NOT NULL;

-- ── trades: external (broker) id for idempotent upserts ─────
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS external_trade_id TEXT;

-- Upsert key used by the sync service: onConflict (trading_account_id, external_trade_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_account_external
  ON public.trades(trading_account_id, external_trade_id)
  WHERE external_trade_id IS NOT NULL;

-- ── BROKER_OPERATION_LOGS — traceability without secrets ────
CREATE TABLE IF NOT EXISTS public.broker_operation_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID REFERENCES public.trading_accounts(id) ON DELETE SET NULL,
  user_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  operation      TEXT NOT NULL,
  provider       TEXT NOT NULL DEFAULT 'metaapi',
  status         TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  error_code     TEXT,
  error_message  TEXT,
  safe_metadata  JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broker_op_logs_account ON public.broker_operation_logs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broker_op_logs_op      ON public.broker_operation_logs(operation, created_at DESC);

ALTER TABLE public.broker_operation_logs ENABLE ROW LEVEL SECURITY;

-- Admins read all; a trader reads logs for their own accounts. Writes are
-- service-role only (broker code) — no client INSERT policy.
CREATE POLICY "broker_op_logs_admin_select"
  ON public.broker_operation_logs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "broker_op_logs_trader_select"
  ON public.broker_operation_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trading_accounts ta
      WHERE ta.id = account_id AND ta.user_id = auth.uid()
    )
  );
