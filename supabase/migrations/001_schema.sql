-- ============================================================
-- AURIX Trading Platform — Supabase Schema Migration 001
-- ============================================================

-- ---- Helper: updated_at trigger ----
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---- PROFILES ----
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT UNIQUE NOT NULL,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'TRADER'
              CHECK (role IN ('TRADER', 'ADMIN')),
  status      TEXT NOT NULL DEFAULT 'ACTIVE'
              CHECK (status IN ('ACTIVE', 'SUSPENDED', 'PENDING')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role   ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_email  ON public.profiles(email);

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- Helper: is_admin() — created AFTER profiles table ----
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'ADMIN'
      AND status = 'ACTIVE'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- Helper: is_active_user() — created AFTER profiles table ----
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'ACTIVE'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- TRADER_PROFILES ----
CREATE TABLE IF NOT EXISTS public.trader_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  segment     TEXT NOT NULL DEFAULT 'EVALUATION'
              CHECK (segment IN ('EVALUATION', 'FUNDED', 'AT_RISK', 'VIP')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_trader_profiles_updated_at
  BEFORE UPDATE ON public.trader_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- TRADING_ACCOUNTS ----
CREATE TABLE IF NOT EXISTS public.trading_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_name      TEXT NOT NULL,
  broker_name       TEXT NOT NULL,
  broker_account_id TEXT,
  status            TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','CONNECTED','SYNCING','DISCONNECTED','RESTRICTED')),
  currency          TEXT NOT NULL DEFAULT 'USD',
  initial_balance   NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trading_accounts_user_id        ON public.trading_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_accounts_status         ON public.trading_accounts(status);
CREATE INDEX IF NOT EXISTS idx_trading_accounts_user_status    ON public.trading_accounts(user_id, status);

CREATE OR REPLACE TRIGGER trg_trading_accounts_updated_at
  BEFORE UPDATE ON public.trading_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- BROKER_CREDENTIALS ----
CREATE TABLE IF NOT EXISTS public.broker_credentials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_account_id  UUID UNIQUE NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  encrypted_reference TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_broker_credentials_updated_at
  BEFORE UPDATE ON public.broker_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- ACCOUNT_SNAPSHOTS ----
CREATE TABLE IF NOT EXISTS public.account_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_account_id  UUID NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  balance             NUMERIC(18,2) NOT NULL,
  equity              NUMERIC(18,2) NOT NULL,
  floating_pnl        NUMERIC(18,2) NOT NULL DEFAULT 0,
  drawdown_percent    NUMERIC(7,2)  NOT NULL DEFAULT 0,
  captured_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_snapshots_account         ON public.account_snapshots(trading_account_id);
CREATE INDEX IF NOT EXISTS idx_account_snapshots_account_time    ON public.account_snapshots(trading_account_id, captured_at DESC);

-- ---- TRADES ----
CREATE TABLE IF NOT EXISTS public.trades (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_account_id  UUID NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  symbol              TEXT NOT NULL,
  side                TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  status              TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  volume              NUMERIC(12,4) NOT NULL,
  open_price          NUMERIC(18,6) NOT NULL,
  close_price         NUMERIC(18,6),
  profit              NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  opened_at           TIMESTAMPTZ NOT NULL,
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_account                ON public.trades(trading_account_id);
CREATE INDEX IF NOT EXISTS idx_trades_account_status         ON public.trades(trading_account_id, status);
CREATE INDEX IF NOT EXISTS idx_trades_account_status_opened  ON public.trades(trading_account_id, status, opened_at DESC);

CREATE OR REPLACE TRIGGER trg_trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- DAILY_ACCOUNT_METRICS ----
CREATE TABLE IF NOT EXISTS public.daily_account_metrics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_account_id    UUID NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  metric_day            DATE NOT NULL,
  profit                NUMERIC(18,2) NOT NULL DEFAULT 0,
  win_rate_percent      NUMERIC(7,2)  NOT NULL DEFAULT 0,
  max_drawdown_percent  NUMERIC(7,2)  NOT NULL DEFAULT 0,
  trade_count           INTEGER       NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (trading_account_id, metric_day)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_account_day ON public.daily_account_metrics(trading_account_id, metric_day DESC);

CREATE OR REPLACE TRIGGER trg_daily_metrics_updated_at
  BEFORE UPDATE ON public.daily_account_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- RISK_RULES ----
CREATE TABLE IF NOT EXISTS public.risk_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_account_id  UUID REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  severity            TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  metric              TEXT NOT NULL CHECK (metric IN ('DAILY_LOSS', 'MAX_DRAWDOWN', 'OPEN_TRADES')),
  threshold           NUMERIC(18,2) NOT NULL,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_rules_account ON public.risk_rules(trading_account_id);

CREATE OR REPLACE TRIGGER trg_risk_rules_updated_at
  BEFORE UPDATE ON public.risk_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- RISK_EVENTS ----
CREATE TABLE IF NOT EXISTS public.risk_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_account_id  UUID NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  rule_name           TEXT NOT NULL,
  severity            TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  message             TEXT NOT NULL,
  acknowledged_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_events_account  ON public.risk_events(trading_account_id);
CREATE INDEX IF NOT EXISTS idx_risk_events_severity ON public.risk_events(severity);
CREATE INDEX IF NOT EXISTS idx_risk_events_created  ON public.risk_events(created_at DESC);

-- ---- CRM_NOTES ----
CREATE TABLE IF NOT EXISTS public.crm_notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_profile_id UUID NOT NULL REFERENCES public.trader_profiles(id) ON DELETE CASCADE,
  author_user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name       TEXT NOT NULL,
  note              TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_notes_trader  ON public.crm_notes(trader_profile_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_created ON public.crm_notes(created_at DESC);

-- ---- CRM_ACTIVITIES ----
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_profile_id UUID NOT NULL REFERENCES public.trader_profiles(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  description       TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- SUBSCRIPTIONS ----
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_profile_id UUID NOT NULL REFERENCES public.trader_profiles(id) ON DELETE CASCADE,
  plan_name         TEXT NOT NULL,
  status            TEXT NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- NOTIFICATIONS ----
CREATE TABLE IF NOT EXISTS public.notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_account_id  UUID REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  message             TEXT NOT NULL,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);

-- ---- AUDIT_LOGS ----
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor   ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ---- USER_SETTINGS ----
CREATE TABLE IF NOT EXISTS public.user_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notifications_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  timezone                TEXT NOT NULL DEFAULT 'UTC',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- AUTO-CREATE PROFILE ON SIGNUP ----
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_role      TEXT;
BEGIN
  -- Extract full_name from metadata
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- Always assign TRADER for public signups (ignore metadata role for security)
  v_role := 'TRADER';

  -- Insert profile
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (NEW.id, NEW.email, v_full_name, v_role, 'ACTIVE')
  ON CONFLICT (id) DO NOTHING;

  -- Insert trader_profile for TRADER role
  INSERT INTO public.trader_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger to avoid duplicate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
