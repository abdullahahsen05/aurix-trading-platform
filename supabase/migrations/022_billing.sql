-- ============================================================
-- AURIX Trading Platform — Migration 022
-- Billing, payments, subscriptions, copy entitlements,
-- partner payouts. Additive + idempotent.
-- ============================================================

-- ── 1. BILLING_PRODUCTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL
                   CHECK (type IN ('SUBSCRIPTION','COPY_ACCOUNT','BOT','MENTORSHIP','EVALUATION')),
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'USD',
  billing_interval TEXT NOT NULL DEFAULT 'ONE_TIME'
                   CHECK (billing_interval IN ('MONTHLY','ONE_TIME','FREE')),
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_products_code   ON public.billing_products(code);
CREATE INDEX IF NOT EXISTS idx_billing_products_active ON public.billing_products(active, type);

CREATE OR REPLACE TRIGGER trg_billing_products_updated_at
  BEFORE UPDATE ON public.billing_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed core products (idempotent via ON CONFLICT)
INSERT INTO public.billing_products (code, name, type, amount, currency, billing_interval, active)
VALUES
  ('PLATFORM_MONTHLY',    'Platform Subscription',          'SUBSCRIPTION',  50.00, 'USD', 'MONTHLY',  TRUE),
  ('COPY_NORMAL',         'Copy Trading – Normal Account',  'COPY_ACCOUNT',  10.00, 'USD', 'MONTHLY',  TRUE),
  ('COPY_ULTRA_FAST',     'Copy Trading – Ultra Fast',      'COPY_ACCOUNT',  15.00, 'USD', 'MONTHLY',  TRUE),
  ('BOT_EA',              'Trading Bot / EA Purchase',      'BOT',          500.00, 'USD', 'ONE_TIME', TRUE),
  ('MENTORSHIP_1_1',      '1-to-1 Mentorship',              'MENTORSHIP',  2500.00, 'EUR', 'ONE_TIME', TRUE),
  ('EVALUATION_CHALLENGE','Evaluation Challenge',            'EVALUATION',     0.00, 'USD', 'FREE',     TRUE)
ON CONFLICT (code) DO NOTHING;

-- ── 2. PAYMENT_ORDERS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id                  UUID NOT NULL REFERENCES public.billing_products(id),
  amount                      NUMERIC(12,2) NOT NULL,
  currency                    TEXT NOT NULL DEFAULT 'USD',
  status                      TEXT NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING','PAID','FAILED','CANCELLED','REFUNDED')),
  provider                    TEXT NOT NULL DEFAULT 'AIRWALLEX',
  provider_payment_intent_id  TEXT,
  provider_checkout_url       TEXT,
  -- optional context fields
  trading_account_id          UUID REFERENCES public.trading_accounts(id) ON DELETE SET NULL,
  tier                        TEXT CHECK (tier IN ('NORMAL','PREMIUM')),
  -- for bot purchases, links to bot_products.id
  bot_product_id              UUID REFERENCES public.bot_products(id) ON DELETE SET NULL,
  metadata                    JSONB,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at                     TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_intent
  ON public.payment_orders(provider_payment_intent_id)
  WHERE provider_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_orders_user    ON public.payment_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status  ON public.payment_orders(status, created_at DESC);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_orders_user_select"
  ON public.payment_orders FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "payment_orders_admin_write"
  ON public.payment_orders FOR ALL
  USING (public.is_admin());

-- ── 3. SUBSCRIPTIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES public.billing_products(id),
  payment_order_id    UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING_APPROVAL'
                      CHECK (status IN (
                        'PENDING_APPROVAL','ACTIVE','EXPIRED','CANCELLED','PAYMENT_FAILED'
                      )),
  starts_at           TIMESTAMPTZ,
  current_period_end  TIMESTAMPTZ,
  approved_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user   ON public.subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status, current_period_end);

CREATE OR REPLACE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_user_select"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "subscriptions_admin_write"
  ON public.subscriptions FOR ALL
  USING (public.is_admin());

-- ── 4. COPY_ACCOUNT_ENTITLEMENTS ───────────────────────────
CREATE TABLE IF NOT EXISTS public.copy_account_entitlements (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trading_account_id   UUID REFERENCES public.trading_accounts(id) ON DELETE SET NULL,
  payment_order_id     UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  tier                 TEXT NOT NULL DEFAULT 'NORMAL'
                       CHECK (tier IN ('NORMAL','PREMIUM')),
  status               TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
                       CHECK (status IN (
                         'PENDING_PAYMENT','PENDING_APPROVAL','ACTIVE','EXPIRED','CANCELLED'
                       )),
  amount               NUMERIC(12,2),
  currency             TEXT NOT NULL DEFAULT 'USD',
  current_period_end   TIMESTAMPTZ,
  approved_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copy_entitlements_user   ON public.copy_account_entitlements(user_id, status);
CREATE INDEX IF NOT EXISTS idx_copy_entitlements_account ON public.copy_account_entitlements(trading_account_id, status)
  WHERE trading_account_id IS NOT NULL;

CREATE OR REPLACE TRIGGER trg_copy_entitlements_updated_at
  BEFORE UPDATE ON public.copy_account_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.copy_account_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copy_entitlements_user_select"
  ON public.copy_account_entitlements FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "copy_entitlements_admin_write"
  ON public.copy_account_entitlements FOR ALL
  USING (public.is_admin());

-- ── 5. Extend PARTNER_COMMISSIONS ──────────────────────────
-- Add payment_order_id and payout_month (additive)
ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL;

ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS payout_month TEXT; -- e.g. '2026-07'

-- Map existing commission_type field from partner_commissions
-- (already has status PENDING/APPROVED/PAID/CANCELLED from 008)

-- ── 6. PARTNER_PAYOUTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,              -- 'YYYY-MM'
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',
  status       TEXT NOT NULL DEFAULT 'DRAFT'
               CHECK (status IN ('DRAFT','APPROVED','PAID')),
  paid_at      TIMESTAMPTZ,
  admin_note   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partner_id, month)
);

CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner ON public.partner_payouts(partner_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_status  ON public.partner_payouts(status);

CREATE OR REPLACE TRIGGER trg_partner_payouts_updated_at
  BEFORE UPDATE ON public.partner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_payouts_select_own_or_admin"
  ON public.partner_payouts FOR SELECT
  USING (partner_id = auth.uid() OR public.is_admin());

CREATE POLICY "partner_payouts_admin_write"
  ON public.partner_payouts FOR ALL
  USING (public.is_admin());
