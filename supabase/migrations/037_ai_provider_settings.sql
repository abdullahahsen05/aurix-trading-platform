-- Migration 037: encrypted, server-only AI provider configuration.
-- API keys are encrypted by the application before insertion. No client RLS
-- policies are added, so only the service role can read or write this table.

CREATE TABLE IF NOT EXISTS public.ai_provider_settings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider           TEXT NOT NULL UNIQUE CHECK (provider IN ('GEMINI', 'OPENAI')),
  is_active          BOOLEAN NOT NULL DEFAULT FALSE,
  encrypted_api_key  TEXT NOT NULL,
  api_key_hint       TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'NOT_CONFIGURED'
                     CHECK (status IN ('NOT_CONFIGURED', 'VALID', 'INVALID')),
  last_validated_at  TIMESTAMPTZ,
  last_error         TEXT,
  created_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_provider_one_active
  ON public.ai_provider_settings(is_active)
  WHERE is_active = TRUE;

CREATE OR REPLACE TRIGGER trg_ai_provider_settings_updated_at
  BEFORE UPDATE ON public.ai_provider_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ai_provider_settings ENABLE ROW LEVEL SECURITY;
