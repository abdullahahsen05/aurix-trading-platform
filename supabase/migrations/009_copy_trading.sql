-- ============================================================
-- AURIX Trading Platform — Supabase Schema Migration 009
-- Phase 3: Copy Trading System (simulation-first, live disabled by default)
-- Additive + idempotent.
-- ============================================================

-- ── COPY_STRATEGIES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.copy_strategies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT,
  master_account_id     UUID NOT NULL REFERENCES public.trading_accounts(id) ON DELETE RESTRICT,
  status                TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  mode                  TEXT NOT NULL DEFAULT 'SIMULATION'
                        CHECK (mode IN ('SIMULATION', 'LIVE')),
  live_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  risk_multiplier       NUMERIC(10,4) NOT NULL DEFAULT 1,
  default_scaling_mode  TEXT NOT NULL DEFAULT 'EQUITY_PROPORTIONAL'
                        CHECK (default_scaling_mode IN ('FIXED_MULTIPLIER','BALANCE_PROPORTIONAL','EQUITY_PROPORTIONAL','FIXED_LOT')),
  max_follower_lot      NUMERIC(12,4),
  max_open_copied_trades INTEGER,
  symbol_allowlist      TEXT[],
  symbol_blocklist      TEXT[],
  created_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copy_strategies_master ON public.copy_strategies(master_account_id);
CREATE INDEX IF NOT EXISTS idx_copy_strategies_status ON public.copy_strategies(status);

CREATE OR REPLACE TRIGGER trg_copy_strategies_updated_at
  BEFORE UPDATE ON public.copy_strategies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── COPY_MASTER_EVENTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.copy_master_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id       UUID NOT NULL REFERENCES public.copy_strategies(id) ON DELETE CASCADE,
  master_account_id UUID NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL CHECK (event_type IN ('OPEN', 'CLOSE', 'MODIFY')),
  master_trade_id   TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  side              TEXT,
  volume            NUMERIC(12,4),
  open_price        NUMERIC(18,6),
  close_price       NUMERIC(18,6),
  stop_loss         NUMERIC(18,6),
  take_profit       NUMERIC(18,6),
  event_time        TIMESTAMPTZ NOT NULL,
  dedupe_key        TEXT NOT NULL UNIQUE,
  raw_payload       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copy_master_events_strategy ON public.copy_master_events(strategy_id, created_at DESC);

-- ── COPY_STRATEGY_FOLLOWERS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.copy_strategy_followers (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id            UUID NOT NULL REFERENCES public.copy_strategies(id) ON DELETE CASCADE,
  follower_account_id    UUID NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  trader_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status                 TEXT NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','ACTIVE','PAUSED','DISABLED','REVOKED')),
  scaling_mode           TEXT CHECK (scaling_mode IN ('FIXED_MULTIPLIER','BALANCE_PROPORTIONAL','EQUITY_PROPORTIONAL','FIXED_LOT')),
  risk_multiplier        NUMERIC(10,4),
  fixed_lot              NUMERIC(12,4),
  max_lot                NUMERIC(12,4),
  max_open_trades        INTEGER,
  max_daily_loss_percent NUMERIC(7,2),
  max_drawdown_percent   NUMERIC(7,2),
  symbol_allowlist       TEXT[],
  symbol_blocklist       TEXT[],
  consent_accepted_at    TIMESTAMPTZ,
  paused_at              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (strategy_id, follower_account_id)
);

CREATE INDEX IF NOT EXISTS idx_copy_followers_strategy ON public.copy_strategy_followers(strategy_id);
CREATE INDEX IF NOT EXISTS idx_copy_followers_trader   ON public.copy_strategy_followers(trader_id);

CREATE OR REPLACE TRIGGER trg_copy_followers_updated_at
  BEFORE UPDATE ON public.copy_strategy_followers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── COPY_EXECUTION_LOGS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.copy_execution_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id         UUID NOT NULL REFERENCES public.copy_strategies(id) ON DELETE CASCADE,
  master_event_id     UUID NOT NULL REFERENCES public.copy_master_events(id) ON DELETE CASCADE,
  follower_account_id UUID REFERENCES public.trading_accounts(id) ON DELETE SET NULL,
  trader_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  mode                TEXT NOT NULL CHECK (mode IN ('SIMULATION', 'LIVE')),
  action              TEXT NOT NULL CHECK (action IN ('OPEN','CLOSE','MODIFY','SKIPPED')),
  status              TEXT NOT NULL CHECK (status IN ('PENDING','SUCCESS','FAILED','SKIPPED','RETRYING')),
  calculated_lot      NUMERIC(12,4),
  requested_lot       NUMERIC(12,4),
  executed_lot        NUMERIC(12,4),
  symbol              TEXT,
  side                TEXT,
  broker_order_id     TEXT,
  error_code          TEXT,
  error_message       TEXT,
  raw_request         JSONB,
  raw_response        JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copy_logs_strategy ON public.copy_execution_logs(strategy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_logs_event    ON public.copy_execution_logs(master_event_id);
CREATE INDEX IF NOT EXISTS idx_copy_logs_trader   ON public.copy_execution_logs(trader_id, created_at DESC);
-- Idempotency guard for LIVE orders: one successful live order per (event, follower, action).
CREATE UNIQUE INDEX IF NOT EXISTS idx_copy_logs_live_dedup
  ON public.copy_execution_logs(master_event_id, follower_account_id, action)
  WHERE mode = 'LIVE' AND status = 'SUCCESS';

-- ── COPY_GLOBAL_SETTINGS (single row) ───────────────────────
CREATE TABLE IF NOT EXISTS public.copy_global_settings (
  id                     BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  live_copy_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_stop_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single settings row (live disabled by default).
INSERT INTO public.copy_global_settings (id, live_copy_enabled, emergency_stop_enabled)
VALUES (TRUE, FALSE, FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE TRIGGER trg_copy_global_settings_updated_at
  BEFORE UPDATE ON public.copy_global_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── ROW LEVEL SECURITY ──────────────────────────────────────
ALTER TABLE public.copy_strategies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_master_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_strategy_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_execution_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_global_settings    ENABLE ROW LEVEL SECURITY;

-- Strategies: admins manage; traders may read ACTIVE strategies (to browse/opt in).
CREATE POLICY "copy_strategies_admin_all"
  ON public.copy_strategies FOR ALL USING (public.is_admin());
CREATE POLICY "copy_strategies_trader_select"
  ON public.copy_strategies FOR SELECT
  USING (public.is_active_user() AND status = 'ACTIVE');

-- Master events: admin only (no trader-facing master data).
CREATE POLICY "copy_master_events_admin_all"
  ON public.copy_master_events FOR ALL USING (public.is_admin());

-- Followers: admins manage all; a trader reads/updates only their own subscriptions.
CREATE POLICY "copy_followers_admin_all"
  ON public.copy_strategy_followers FOR ALL USING (public.is_admin());
CREATE POLICY "copy_followers_trader_select"
  ON public.copy_strategy_followers FOR SELECT USING (trader_id = auth.uid());

-- Execution logs: admins read all; a trader reads only their own logs. Writes are
-- service-role only (copy engine) — no client INSERT policy.
CREATE POLICY "copy_logs_admin_select"
  ON public.copy_execution_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "copy_logs_trader_select"
  ON public.copy_execution_logs FOR SELECT USING (trader_id = auth.uid());

-- Global settings: admins read/write; all active users may read (UI banner).
CREATE POLICY "copy_settings_admin_all"
  ON public.copy_global_settings FOR ALL USING (public.is_admin());
CREATE POLICY "copy_settings_active_select"
  ON public.copy_global_settings FOR SELECT USING (public.is_active_user());
