-- Migration 039: advanced follower settings and safe trader self-copy setup.
-- All relationships remain simulation-only until the existing global and
-- BROKER_EXECUTION_ENABLED live gates are explicitly enabled.

ALTER TABLE public.copy_strategy_followers
  ADD COLUMN IF NOT EXISTS copy_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS copy_mode TEXT
    CHECK (copy_mode IS NULL OR copy_mode IN ('FIXED_LOT','LOT_MULTIPLIER','BALANCE_RATIO','RISK_PERCENT')),
  ADD COLUMN IF NOT EXISTS lot_multiplier NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS risk_percent NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS min_lot NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS max_equity_drawdown_percent NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS max_slippage NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS max_spread NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS copy_stop_loss BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS copy_take_profit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS copy_existing_trades BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS copy_new_trades_only BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS reverse_copy BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS symbol_mapping JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS pause_on_disconnect BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS emergency_stop BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.copy_strategy_followers
  DROP CONSTRAINT IF EXISTS copy_followers_min_max_lot_check;
ALTER TABLE public.copy_strategy_followers
  ADD CONSTRAINT copy_followers_min_max_lot_check
  CHECK (min_lot IS NULL OR max_lot IS NULL OR max_lot >= min_lot);

CREATE TABLE IF NOT EXISTS public.self_copy_relationships (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_account_id    UUID NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  follower_account_id  UUID NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'SIMULATION'
                       CHECK (status IN ('SIMULATION','PAUSED','ARCHIVED')),
  copy_settings        JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_account_id <> follower_account_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_self_copy_active_pair
  ON public.self_copy_relationships(trader_id, source_account_id, follower_account_id)
  WHERE status IN ('SIMULATION','PAUSED');
CREATE INDEX IF NOT EXISTS idx_self_copy_trader
  ON public.self_copy_relationships(trader_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_self_copy_source
  ON public.self_copy_relationships(source_account_id)
  WHERE status IN ('SIMULATION','PAUSED');

CREATE OR REPLACE TRIGGER trg_self_copy_relationships_updated_at
  BEFORE UPDATE ON public.self_copy_relationships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.self_copy_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self_copy_select_own_or_admin"
  ON public.self_copy_relationships FOR SELECT
  USING (trader_id = auth.uid() OR public.is_admin());
CREATE POLICY "self_copy_admin_all"
  ON public.self_copy_relationships FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
