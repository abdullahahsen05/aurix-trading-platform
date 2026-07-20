-- Migration 040: partner rebate ledger and withdrawal allocation support.

ALTER TABLE public.partner_commissions
  DROP CONSTRAINT IF EXISTS partner_commissions_status_check;
ALTER TABLE public.partner_commissions
  ADD CONSTRAINT partner_commissions_status_check
  CHECK (status IN ('PENDING','APPROVED','PAID','CANCELLED','REVERSED'));

CREATE TABLE IF NOT EXISTS public.partner_rebates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trader_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  payment_order_id  UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  source_type       TEXT NOT NULL DEFAULT 'ADJUSTMENT',
  amount            NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  status            TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','APPROVED','PAID','CANCELLED','REVERSED')),
  description       TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  approved_at       TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.partner_withdrawal_rebate_allocations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_request_id UUID NOT NULL REFERENCES public.partner_withdrawal_requests(id) ON DELETE CASCADE,
  rebate_id             UUID NOT NULL REFERENCES public.partner_rebates(id) ON DELETE RESTRICT,
  allocated_amount      NUMERIC(18,2) NOT NULL CHECK (allocated_amount > 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (withdrawal_request_id, rebate_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_rebates_partner
  ON public.partner_rebates(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_rebates_status
  ON public.partner_rebates(status, currency);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawal_rebate
  ON public.partner_withdrawal_rebate_allocations(rebate_id);

CREATE OR REPLACE TRIGGER trg_partner_rebates_updated_at
  BEFORE UPDATE ON public.partner_rebates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partner_rebates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_withdrawal_rebate_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_rebates_select_own_or_admin"
  ON public.partner_rebates FOR SELECT
  USING (partner_id = auth.uid() OR public.is_admin());
CREATE POLICY "partner_rebates_admin_write"
  ON public.partner_rebates FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "partner_withdrawal_rebate_allocations_select"
  ON public.partner_withdrawal_rebate_allocations FOR SELECT
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.partner_withdrawal_requests request
      WHERE request.id = withdrawal_request_id AND request.partner_id = auth.uid()
    )
  );
CREATE POLICY "partner_withdrawal_rebate_allocations_admin_write"
  ON public.partner_withdrawal_rebate_allocations FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
