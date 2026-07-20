-- Migration 038: admin-managed MetaTrader broker/server catalog.
-- The installed MetaApi SDK does not expose reliable broker-server discovery,
-- so rows are explicitly marked MANUAL and surfaced as configured data.

CREATE TABLE IF NOT EXISTS public.broker_providers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL UNIQUE,
  display_name         TEXT NOT NULL,
  platforms_supported  TEXT[] NOT NULL DEFAULT ARRAY['MT5']::TEXT[],
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(platforms_supported) > 0),
  CHECK (platforms_supported <@ ARRAY['MT4','MT5']::TEXT[])
);

CREATE TABLE IF NOT EXISTS public.broker_servers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_provider_id  UUID NOT NULL REFERENCES public.broker_providers(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL CHECK (platform IN ('MT4','MT5')),
  server_name         TEXT NOT NULL,
  source              TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','METAAPI')),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  last_refreshed_at   TIMESTAMPTZ,
  created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broker_provider_id, platform, server_name)
);

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS broker_provider_id UUID REFERENCES public.broker_providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_broker_providers_active
  ON public.broker_providers(is_active, display_name);
CREATE INDEX IF NOT EXISTS idx_broker_servers_lookup
  ON public.broker_servers(broker_provider_id, platform, is_active, server_name);
CREATE INDEX IF NOT EXISTS idx_trading_accounts_broker_provider
  ON public.trading_accounts(broker_provider_id);

CREATE OR REPLACE TRIGGER trg_broker_providers_updated_at
  BEFORE UPDATE ON public.broker_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_broker_servers_updated_at
  BEFORE UPDATE ON public.broker_servers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.broker_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_providers_admin_all"
  ON public.broker_providers FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "broker_providers_active_select"
  ON public.broker_providers FOR SELECT
  USING (public.is_active_user() AND is_active = TRUE);

CREATE POLICY "broker_servers_admin_all"
  ON public.broker_servers FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "broker_servers_active_select"
  ON public.broker_servers FOR SELECT
  USING (
    public.is_active_user()
    AND is_active = TRUE
    AND EXISTS (
      SELECT 1 FROM public.broker_providers provider
      WHERE provider.id = broker_provider_id AND provider.is_active = TRUE
    )
  );
