-- Phase 8: dxFeed-Ready Institutional Terminal
-- Two tables: admin-managed provider settings + per-user preferences

CREATE TABLE public.terminal_provider_settings (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider   TEXT        NOT NULL DEFAULT 'mock' CHECK (provider IN ('mock', 'dxfeed')),
  is_enabled BOOLEAN     NOT NULL DEFAULT true,
  demo_mode  BOOLEAN     NOT NULL DEFAULT true,
  notes      TEXT,
  updated_by UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with default row (single-row config table — always update, never insert more)
INSERT INTO public.terminal_provider_settings (provider, is_enabled, demo_mode, notes)
VALUES (
  'mock',
  true,
  true,
  'Default mock provider — configure MARKET_DATA_PROVIDER=dxfeed and dxFeed credentials to enable live institutional data'
);

CREATE TABLE public.terminal_user_preferences (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol    TEXT        NOT NULL DEFAULT 'EURUSD',
  timeframe TEXT        NOT NULL DEFAULT '1h' CHECK (timeframe IN ('1m','5m','15m','1h','4h','1d')),
  layout    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS
ALTER TABLE public.terminal_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_user_preferences ENABLE ROW LEVEL SECURITY;

-- Provider settings: no direct trader access — service role only (createAdminClient bypasses RLS)
CREATE POLICY "deny_all_terminal_settings" ON public.terminal_provider_settings
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- Preferences: traders manage their own row only
CREATE POLICY "own_terminal_preferences" ON public.terminal_user_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Index for quick user preference lookup
CREATE INDEX idx_terminal_prefs_user ON public.terminal_user_preferences(user_id);
