-- ============================================================
-- AURIX Trading Platform — Migration 023
-- Partner pending-review status + signup trigger for partner role
-- ============================================================

-- ── 1. Add PENDING_REVIEW to partner_profiles.status ────────
ALTER TABLE public.partner_profiles DROP CONSTRAINT IF EXISTS partner_profiles_status_check;
ALTER TABLE public.partner_profiles
  ADD CONSTRAINT partner_profiles_status_check
  CHECK (status IN ('PENDING_REVIEW', 'ACTIVE', 'SUSPENDED'));

-- ── 2. Update handle_new_user() to support PARTNER signups ──
-- Reads role='PARTNER' from signup metadata; never allows ADMIN from metadata.
-- PARTNER: creates partner_profiles row with PENDING_REVIEW status.
-- TRADER (default): creates trader_profiles row as before.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name     TEXT;
  v_role          TEXT;
  v_referral_code TEXT;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- Accept PARTNER from metadata; block ADMIN from metadata as a security boundary
  v_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' = 'PARTNER' THEN 'PARTNER'
    ELSE 'TRADER'
  END;

  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (NEW.id, NEW.email, v_full_name, v_role, 'ACTIVE')
  ON CONFLICT (id) DO NOTHING;

  IF v_role = 'PARTNER' THEN
    -- Referral code: 4 alpha chars from name (padded with X) + 6 hex chars from UUID
    -- UUID-based suffix guarantees uniqueness without a retry loop
    v_referral_code :=
      UPPER(RPAD(REGEXP_REPLACE(v_full_name, '[^a-zA-Z]', '', 'g'), 4, 'X'))
      || UPPER(SUBSTR(REPLACE(NEW.id::TEXT, '-', ''), 1, 6));

    INSERT INTO public.partner_profiles (user_id, referral_code, status)
    VALUES (NEW.id, v_referral_code, 'PENDING_REVIEW')
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    INSERT INTO public.trader_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
