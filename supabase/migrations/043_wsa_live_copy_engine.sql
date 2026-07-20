-- WSA Global owned live copy engine.
-- CopyFactory columns from migration 042 are intentionally retained as inert
-- historical schema so this migration is non-destructive.

ALTER TABLE public.copy_strategies
  ADD COLUMN IF NOT EXISTS engine_status TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS engine_error TEXT,
  ADD COLUMN IF NOT EXISTS engine_heartbeat_at TIMESTAMPTZ;

ALTER TABLE public.copy_strategies
  DROP CONSTRAINT IF EXISTS copy_strategies_engine_status_check;
ALTER TABLE public.copy_strategies
  ADD CONSTRAINT copy_strategies_engine_status_check
  CHECK (engine_status IN ('DRAFT', 'STARTING', 'LIVE', 'PAUSED', 'DRAINING', 'ERROR', 'ARCHIVED'));

ALTER TABLE public.copy_strategy_followers
  ADD COLUMN IF NOT EXISTS engine_status TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS engine_error TEXT,
  ADD COLUMN IF NOT EXISTS engine_synced_at TIMESTAMPTZ;

ALTER TABLE public.copy_strategy_followers
  DROP CONSTRAINT IF EXISTS copy_followers_engine_status_check;
ALTER TABLE public.copy_strategy_followers
  ADD CONSTRAINT copy_followers_engine_status_check
  CHECK (engine_status IN ('DRAFT', 'LIVE', 'PAUSED', 'ERROR', 'REMOVED'));

ALTER TABLE public.copy_master_events
  ADD COLUMN IF NOT EXISTS stop_loss NUMERIC,
  ADD COLUMN IF NOT EXISTS take_profit NUMERIC,
  ADD COLUMN IF NOT EXISTS previous_volume NUMERIC,
  ADD COLUMN IF NOT EXISTS source_sequence TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'POLLING';

CREATE TABLE IF NOT EXISTS public.copy_trade_links (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id           UUID NOT NULL REFERENCES public.copy_strategies(id) ON DELETE CASCADE,
  follower_id           UUID NOT NULL REFERENCES public.copy_strategy_followers(id) ON DELETE CASCADE,
  follower_account_id   UUID NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  trader_id             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  master_trade_id       TEXT NOT NULL,
  source_event_id       UUID NOT NULL REFERENCES public.copy_master_events(id) ON DELETE RESTRICT,
  follower_position_id  TEXT,
  follower_order_id     TEXT,
  symbol                TEXT NOT NULL,
  side                  TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  copied_volume         NUMERIC NOT NULL DEFAULT 0 CHECK (copied_volume >= 0),
  status                TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'OPEN', 'CLOSING', 'CLOSED', 'FAILED')),
  error_code            TEXT,
  error_message         TEXT,
  opened_at             TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_event_id, follower_account_id)
);

CREATE INDEX IF NOT EXISTS idx_copy_trade_links_master_open
  ON public.copy_trade_links(strategy_id, master_trade_id, status);
CREATE INDEX IF NOT EXISTS idx_copy_trade_links_follower_open
  ON public.copy_trade_links(follower_account_id, status);

CREATE OR REPLACE TRIGGER trg_copy_trade_links_updated_at
  BEFORE UPDATE ON public.copy_trade_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.copy_trade_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "copy_trade_links_admin_select" ON public.copy_trade_links;
CREATE POLICY "copy_trade_links_admin_select"
  ON public.copy_trade_links FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "copy_trade_links_trader_select" ON public.copy_trade_links;
CREATE POLICY "copy_trade_links_trader_select"
  ON public.copy_trade_links FOR SELECT USING (trader_id = auth.uid());

-- Existing CopyFactory strategies are deliberately returned to DRAFT. An
-- administrator must explicitly publish them to the WSA engine; this prevents
-- a migration from placing orders by itself.
UPDATE public.copy_strategies
SET engine_status = 'DRAFT', live_enabled = FALSE
WHERE copyfactory_strategy_id IS NOT NULL AND engine_status = 'DRAFT';

ALTER TABLE public.background_jobs DROP CONSTRAINT IF EXISTS background_jobs_type_check;
ALTER TABLE public.background_jobs ADD CONSTRAINT background_jobs_type_check CHECK (type IN (
  'SYNC_ACCOUNT', 'SYNC_ALL_CONNECTED_ACCOUNTS',
  'MONITOR_COPY_STRATEGY', 'MONITOR_ALL_ACTIVE_COPY_STRATEGIES',
  'SIMULATE_COPY_EVENT', 'SIMULATE_COPY_STRATEGY',
  'EXECUTE_COPY_EVENT', 'CLOSE_COPY_STRATEGY', 'RETRY_COPY_LOG',
  'CLEANUP_STALE_JOBS',
  'SYNC_EVALUATION_ACCOUNT', 'CHECK_EVALUATION_ATTEMPT', 'CHECK_ALL_ACTIVE_EVALUATIONS'
));
