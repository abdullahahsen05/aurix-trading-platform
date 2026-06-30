-- ============================================================
-- AURIX Trading Platform — Supabase Schema Migration 008
-- Phase 2: Partner Dashboard
-- Adds the PARTNER role, partner attribution, partner CRM source,
-- and an internal partner commission ledger. Additive + idempotent.
-- ============================================================

-- ── 1. Allow PARTNER as a profile role ──────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('TRADER', 'ADMIN', 'PARTNER'));

-- ── 2. is_partner() helper (mirrors is_admin) ───────────────
CREATE OR REPLACE FUNCTION public.is_partner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'PARTNER'
      AND status = 'ACTIVE'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 3. Partner attribution on trader_profiles ───────────────
ALTER TABLE public.trader_profiles
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.trader_profiles
  ADD COLUMN IF NOT EXISTS partner_assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_trader_profiles_partner
  ON public.trader_profiles(partner_id)
  WHERE partner_id IS NOT NULL;

-- ── 4. CRM note source (keeps admin notes private from partners) ─
ALTER TABLE public.crm_notes
  ADD COLUMN IF NOT EXISTS note_source TEXT NOT NULL DEFAULT 'ADMIN'
  CHECK (note_source IN ('ADMIN', 'PARTNER'));

-- ── 5. PARTNER_PROFILES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_profiles (
  user_id            UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code      TEXT UNIQUE NOT NULL,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 30
                     CHECK (commission_percent >= 0 AND commission_percent <= 100),
  status             TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_profiles_referral
  ON public.partner_profiles(referral_code);

CREATE OR REPLACE TRIGGER trg_partner_profiles_updated_at
  BEFORE UPDATE ON public.partner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. PARTNER_COMMISSIONS (internal manual ledger) ─────────
CREATE TABLE IF NOT EXISTS public.partner_commissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trader_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_type        TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
  source_id          UUID,
  gross_amount       NUMERIC(18,2) NOT NULL DEFAULT 0,
  commission_percent NUMERIC(5,2)  NOT NULL DEFAULT 0,
  commission_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'USD',
  status             TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'APPROVED', 'PAID', 'CANCELLED')),
  period_start       DATE,
  period_end         DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at            TIMESTAMPTZ,
  metadata           JSONB
);

CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner
  ON public.partner_commissions(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_status
  ON public.partner_commissions(status);

-- ── 7. Row Level Security ───────────────────────────────────
ALTER TABLE public.partner_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;

-- partner_profiles: a partner reads their own row; admins read/manage all.
CREATE POLICY "partner_profiles_select_own_or_admin"
  ON public.partner_profiles FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "partner_profiles_admin_write"
  ON public.partner_profiles FOR ALL
  USING (public.is_admin());

-- partner_commissions: a partner reads their own records; admins read/manage all.
CREATE POLICY "partner_commissions_select_own_or_admin"
  ON public.partner_commissions FOR SELECT
  USING (partner_id = auth.uid() OR public.is_admin());

CREATE POLICY "partner_commissions_admin_write"
  ON public.partner_commissions FOR ALL
  USING (public.is_admin());

-- trader_profiles: let an assigned partner read the trader_profile rows
-- attributed to them (in addition to the owner + admin already allowed).
CREATE POLICY "trader_profiles_select_partner"
  ON public.trader_profiles FOR SELECT
  USING (partner_id = auth.uid());
