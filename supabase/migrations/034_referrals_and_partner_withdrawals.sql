-- Migration 034: durable referral attribution and partner withdrawal requests.

-- A paid order may create at most one referral commission, including under
-- concurrent webhook/mock confirmation delivery.
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_commissions_purchase_unique
  ON public.partner_commissions(purchase_id)
  WHERE purchase_id IS NOT NULL;

-- Attribute a trader during the auth signup transaction. This works even when
-- email confirmation means the browser has no authenticated session yet.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name     TEXT;
  v_role          TEXT;
  v_referral_code TEXT;
  v_signup_ref    TEXT;
  v_partner_id    UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_role := CASE WHEN NEW.raw_user_meta_data->>'role' = 'PARTNER' THEN 'PARTNER' ELSE 'TRADER' END;

  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (NEW.id, NEW.email, v_full_name, v_role, 'ACTIVE')
  ON CONFLICT (id) DO NOTHING;

  IF v_role = 'PARTNER' THEN
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

    v_signup_ref := UPPER(TRIM(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
    IF v_signup_ref <> '' THEN
      SELECT user_id INTO v_partner_id
      FROM public.partner_profiles
      WHERE referral_code = v_signup_ref AND status = 'ACTIVE'
      LIMIT 1;

      IF v_partner_id IS NOT NULL THEN
        UPDATE public.trader_profiles
        SET partner_id = v_partner_id, partner_assigned_at = NOW()
        WHERE user_id = NEW.id AND partner_id IS NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TABLE IF NOT EXISTS public.partner_withdrawal_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount           NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency         TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  status           TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
                   CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'PAID', 'REJECTED')),
  payout_method    TEXT NOT NULL CHECK (char_length(TRIM(payout_method)) BETWEEN 2 AND 80),
  payout_reference TEXT NOT NULL CHECK (char_length(TRIM(payout_reference)) BETWEEN 2 AND 240),
  requested_note   TEXT CHECK (requested_note IS NULL OR char_length(requested_note) <= 1000),
  admin_note       TEXT CHECK (admin_note IS NULL OR char_length(admin_note) <= 1000),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(TRIM(rejection_reason)) >= 3),
  reviewed_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.partner_withdrawal_allocations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_request_id UUID NOT NULL REFERENCES public.partner_withdrawal_requests(id) ON DELETE CASCADE,
  commission_id         UUID NOT NULL REFERENCES public.partner_commissions(id) ON DELETE RESTRICT,
  allocated_amount      NUMERIC(18,2) NOT NULL CHECK (allocated_amount > 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (withdrawal_request_id, commission_id)
);

-- Only one unresolved request per partner/currency. This is the database race
-- guard that prevents two requests from locking the same balance concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_withdrawal_one_active
  ON public.partner_withdrawal_requests(partner_id, currency)
  WHERE status IN ('PENDING_REVIEW', 'APPROVED');
CREATE INDEX IF NOT EXISTS idx_partner_withdrawal_partner
  ON public.partner_withdrawal_requests(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawal_status
  ON public.partner_withdrawal_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawal_alloc_commission
  ON public.partner_withdrawal_allocations(commission_id);

CREATE OR REPLACE TRIGGER trg_partner_withdrawals_updated_at
  BEFORE UPDATE ON public.partner_withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partner_withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_withdrawal_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_withdrawals_select_own_or_admin"
  ON public.partner_withdrawal_requests FOR SELECT
  USING (partner_id = auth.uid() OR public.is_admin());
CREATE POLICY "partner_withdrawals_admin_write"
  ON public.partner_withdrawal_requests FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "partner_withdrawal_allocations_select"
  ON public.partner_withdrawal_allocations FOR SELECT
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.partner_withdrawal_requests request
      WHERE request.id = withdrawal_request_id AND request.partner_id = auth.uid()
    )
  );
CREATE POLICY "partner_withdrawal_allocations_admin_write"
  ON public.partner_withdrawal_allocations FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Preserve existing notification values and add the workflow event family.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'RISK_EVENT', 'SYNC_SUCCESS', 'SYNC_FAILURE', 'EVAL_PASSED', 'EVAL_FAILED',
    'PARTNER_WITHDRAWAL'
  ));
