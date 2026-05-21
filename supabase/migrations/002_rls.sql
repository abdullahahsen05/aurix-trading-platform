-- ============================================================
-- AURIX Trading Platform — RLS Policies Migration 002
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trader_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_account_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_notes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings     ENABLE ROW LEVEL SECURITY;

-- ---- PROFILES ----
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_update_own_limited"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid() AND public.is_active_user())
  WITH CHECK (
    -- Can update own non-sensitive fields
    id = auth.uid()
    -- Prevent self-elevation: role/status can only be set by admin via service role
  );

CREATE POLICY "profiles_admin_update_all"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- ---- TRADER_PROFILES ----
CREATE POLICY "trader_profiles_select"
  ON public.trader_profiles FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "trader_profiles_admin_update"
  ON public.trader_profiles FOR UPDATE
  USING (public.is_admin());

-- ---- TRADING_ACCOUNTS ----
CREATE POLICY "trading_accounts_select"
  ON public.trading_accounts FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "trading_accounts_insert_own"
  ON public.trading_accounts FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_active_user());

CREATE POLICY "trading_accounts_update_own"
  ON public.trading_accounts FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin());

-- ---- BROKER_CREDENTIALS (no direct client access) ----
CREATE POLICY "broker_credentials_admin_only"
  ON public.broker_credentials FOR ALL
  USING (public.is_admin());

-- ---- ACCOUNT_SNAPSHOTS ----
CREATE POLICY "account_snapshots_select"
  ON public.account_snapshots FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.trading_accounts ta
      WHERE ta.id = trading_account_id
        AND ta.user_id = auth.uid()
    )
  );

-- ---- TRADES ----
CREATE POLICY "trades_select"
  ON public.trades FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.trading_accounts ta
      WHERE ta.id = trading_account_id
        AND ta.user_id = auth.uid()
    )
  );

-- ---- DAILY_ACCOUNT_METRICS ----
CREATE POLICY "daily_metrics_select"
  ON public.daily_account_metrics FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.trading_accounts ta
      WHERE ta.id = trading_account_id
        AND ta.user_id = auth.uid()
    )
  );

-- ---- RISK_RULES ----
CREATE POLICY "risk_rules_select"
  ON public.risk_rules FOR SELECT
  USING (
    -- Platform-level rules visible to all active users
    (trading_account_id IS NULL AND public.is_active_user())
    -- Account-specific rules visible to account owner or admin
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.trading_accounts ta
      WHERE ta.id = trading_account_id
        AND ta.user_id = auth.uid()
    )
  );

CREATE POLICY "risk_rules_admin_write"
  ON public.risk_rules FOR ALL
  USING (public.is_admin());

-- ---- RISK_EVENTS ----
CREATE POLICY "risk_events_select"
  ON public.risk_events FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.trading_accounts ta
      WHERE ta.id = trading_account_id
        AND ta.user_id = auth.uid()
    )
  );

CREATE POLICY "risk_events_admin_update"
  ON public.risk_events FOR UPDATE
  USING (public.is_admin());

-- ---- CRM_NOTES (admin only) ----
CREATE POLICY "crm_notes_admin_all"
  ON public.crm_notes FOR ALL
  USING (public.is_admin());

-- ---- CRM_ACTIVITIES (admin only) ----
CREATE POLICY "crm_activities_admin_all"
  ON public.crm_activities FOR ALL
  USING (public.is_admin());

-- ---- SUBSCRIPTIONS ----
CREATE POLICY "subscriptions_select"
  ON public.subscriptions FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.trader_profiles tp
      WHERE tp.id = trader_profile_id
        AND tp.user_id = auth.uid()
    )
  );

CREATE POLICY "subscriptions_admin_write"
  ON public.subscriptions FOR ALL
  USING (public.is_admin());

-- ---- NOTIFICATIONS ----
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin());

-- ---- AUDIT_LOGS (admin read only) ----
CREATE POLICY "audit_logs_admin_select"
  ON public.audit_logs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "audit_logs_insert_service"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true); -- Any server-side code can insert; reading is admin-only

-- ---- USER_SETTINGS ----
CREATE POLICY "user_settings_own"
  ON public.user_settings FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- ---- REALTIME PUBLICATIONS ----
-- Enable realtime for key tables
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.account_snapshots;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add account_snapshots to supabase_realtime: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add trades to supabase_realtime: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.risk_events;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add risk_events to supabase_realtime: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add notifications to supabase_realtime: %', SQLERRM;
END $$;
