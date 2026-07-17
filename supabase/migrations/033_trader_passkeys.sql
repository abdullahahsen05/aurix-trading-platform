-- Phase 11: trader passkeys and single-use WebAuthn challenges.

CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[],
  device_type TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  device_name TEXT NOT NULL DEFAULT 'Passkey',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_active
  ON public.user_passkeys(user_id, revoked_at);

CREATE TABLE IF NOT EXISTS public.user_passkey_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('REGISTRATION', 'AUTHENTICATION')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expiry
  ON public.user_passkey_challenges(expires_at, consumed_at);

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_passkey_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_passkeys_own_select"
  ON public.user_passkeys FOR SELECT
  USING (user_id = auth.uid() AND revoked_at IS NULL);

CREATE POLICY "user_passkeys_admin_select"
  ON public.user_passkeys FOR SELECT
  USING (public.is_admin());

-- Challenge and passkey mutations are only performed by authenticated,
-- role-gated server endpoints through the service-role client.
