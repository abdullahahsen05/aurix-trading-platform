-- Phase 7: enforceable global and per-account copy stoppage rules.
-- Live execution remains controlled separately and defaults off.

ALTER TABLE public.copy_global_settings
  ADD COLUMN IF NOT EXISTS copy_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS max_daily_loss_percent NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS max_drawdown_percent NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS max_copied_open_positions INTEGER,
  ADD COLUMN IF NOT EXISTS max_lot_size NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS max_slippage_points NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS pause_on_disconnect BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.copy_account_rules (
  trading_account_id       UUID PRIMARY KEY REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  copy_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  max_daily_loss_percent   NUMERIC(7,2),
  max_drawdown_percent     NUMERIC(7,2),
  max_copied_lots          NUMERIC(12,4),
  max_open_copied_positions INTEGER,
  stop_after_losses        INTEGER,
  symbol_allowlist         TEXT[],
  symbol_blocklist         TEXT[],
  paused_at                TIMESTAMPTZ,
  updated_by               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (max_daily_loss_percent IS NULL OR max_daily_loss_percent > 0),
  CHECK (max_drawdown_percent IS NULL OR max_drawdown_percent > 0),
  CHECK (max_copied_lots IS NULL OR max_copied_lots > 0),
  CHECK (max_open_copied_positions IS NULL OR max_open_copied_positions >= 0),
  CHECK (stop_after_losses IS NULL OR stop_after_losses > 0)
);

CREATE OR REPLACE TRIGGER trg_copy_account_rules_updated_at
  BEFORE UPDATE ON public.copy_account_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.copy_rule_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope               TEXT NOT NULL CHECK (scope IN ('GLOBAL','ACCOUNT')),
  rule_code           TEXT NOT NULL,
  reason              TEXT NOT NULL,
  trading_account_id  UUID REFERENCES public.trading_accounts(id) ON DELETE SET NULL,
  strategy_id         UUID REFERENCES public.copy_strategies(id) ON DELETE SET NULL,
  master_event_id     UUID REFERENCES public.copy_master_events(id) ON DELETE SET NULL,
  follower_id         UUID REFERENCES public.copy_strategy_followers(id) ON DELETE SET NULL,
  mode                TEXT NOT NULL CHECK (mode IN ('SIMULATION','LIVE')),
  details             JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copy_rule_events_created
  ON public.copy_rule_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_rule_events_account
  ON public.copy_rule_events(trading_account_id, created_at DESC);

ALTER TABLE public.copy_account_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_rule_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copy_account_rules_admin_all"
  ON public.copy_account_rules FOR ALL USING (public.is_admin());
CREATE POLICY "copy_account_rules_trader_select"
  ON public.copy_account_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trading_accounts account
      WHERE account.id = trading_account_id AND account.user_id = auth.uid()
    )
  );
CREATE POLICY "copy_rule_events_admin_select"
  ON public.copy_rule_events FOR SELECT USING (public.is_admin());
