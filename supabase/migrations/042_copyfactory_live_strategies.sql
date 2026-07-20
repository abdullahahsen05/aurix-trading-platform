-- WSA Global — CopyFactory live strategy publishing and per-strategy billing.
-- Additive and idempotent. Provider calls remain server-side and require explicit
-- runtime configuration; this migration does not place or copy any trade.

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS account_usage TEXT NOT NULL DEFAULT 'TRADER';

ALTER TABLE public.trading_accounts
  DROP CONSTRAINT IF EXISTS trading_accounts_account_usage_check;

ALTER TABLE public.trading_accounts
  ADD CONSTRAINT trading_accounts_account_usage_check
  CHECK (account_usage IN ('TRADER', 'COPY_MASTER'));

CREATE INDEX IF NOT EXISTS idx_trading_accounts_copy_master
  ON public.trading_accounts(user_id, status)
  WHERE account_usage = 'COPY_MASTER';

ALTER TABLE public.copy_strategies
  ADD COLUMN IF NOT EXISTS copyfactory_strategy_id TEXT,
  ADD COLUMN IF NOT EXISTS copyfactory_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN IF NOT EXISTS copyfactory_error TEXT,
  ADD COLUMN IF NOT EXISTS monthly_price NUMERIC(12,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS billing_product_id UUID REFERENCES public.billing_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS close_on_removal_mode TEXT NOT NULL DEFAULT 'close-immediately';

ALTER TABLE public.copy_strategies
  DROP CONSTRAINT IF EXISTS copy_strategies_copyfactory_status_check;

ALTER TABLE public.copy_strategies
  ADD CONSTRAINT copy_strategies_copyfactory_status_check
  CHECK (copyfactory_status IN ('NOT_CONFIGURED', 'PUBLISHING', 'LIVE', 'PAUSED', 'ERROR', 'ARCHIVED'));

ALTER TABLE public.copy_strategies
  DROP CONSTRAINT IF EXISTS copy_strategies_monthly_price_check;

ALTER TABLE public.copy_strategies
  ADD CONSTRAINT copy_strategies_monthly_price_check
  CHECK (monthly_price > 0);

ALTER TABLE public.copy_strategies
  DROP CONSTRAINT IF EXISTS copy_strategies_close_mode_check;

ALTER TABLE public.copy_strategies
  ADD CONSTRAINT copy_strategies_close_mode_check
  CHECK (close_on_removal_mode IN (
    'preserve',
    'close-gracefully-by-position',
    'close-gracefully-by-symbol',
    'close-immediately'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS idx_copy_strategies_copyfactory_id
  ON public.copy_strategies(copyfactory_strategy_id)
  WHERE copyfactory_strategy_id IS NOT NULL;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS copy_strategy_id UUID REFERENCES public.copy_strategies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_orders_copy_strategy
  ON public.payment_orders(copy_strategy_id, user_id, created_at DESC)
  WHERE copy_strategy_id IS NOT NULL;

ALTER TABLE public.copy_account_entitlements
  ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES public.copy_strategies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_copy_entitlements_strategy_account
  ON public.copy_account_entitlements(strategy_id, trading_account_id, status)
  WHERE strategy_id IS NOT NULL;

ALTER TABLE public.copy_strategy_followers
  ADD COLUMN IF NOT EXISTS copyfactory_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN IF NOT EXISTS copyfactory_error TEXT,
  ADD COLUMN IF NOT EXISTS copyfactory_synced_at TIMESTAMPTZ;

ALTER TABLE public.copy_strategy_followers
  DROP CONSTRAINT IF EXISTS copy_followers_copyfactory_status_check;

ALTER TABLE public.copy_strategy_followers
  ADD CONSTRAINT copy_followers_copyfactory_status_check
  CHECK (copyfactory_status IN ('NOT_CONFIGURED', 'SYNCING', 'LIVE', 'PAUSED', 'ERROR', 'REMOVED'));

-- New strategies are live-provider strategies. They still require Publish Live,
-- an active paid follower entitlement and the server-side CopyFactory gate.
ALTER TABLE public.copy_strategies ALTER COLUMN mode SET DEFAULT 'LIVE';
