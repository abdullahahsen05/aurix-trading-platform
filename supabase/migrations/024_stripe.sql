-- ============================================================
-- AURIX Trading Platform — Migration 024
-- Stripe provider: add Stripe-specific columns, customer mapping,
-- and webhook-event deduplication table.
-- Additive + idempotent.
-- ============================================================

-- ── 1. PROFILES — Stripe customer ID ──────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ── 2. PAYMENT_ORDERS — Stripe IDs ─────────────────────────
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id    TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id      TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id          TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_orders_stripe_session
  ON public.payment_orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_orders_stripe_sub
  ON public.payment_orders(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Extend provider CHECK to include STRIPE and MOCK.
-- Preserve existing AIRWALLEX rows as historical records.
ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_provider_check;

ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_provider_check
  CHECK (provider IN ('AIRWALLEX', 'STRIPE', 'MOCK'));

-- ── 3. SUBSCRIPTIONS — Stripe IDs ──────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS current_period_start    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ── 4. COPY_ACCOUNT_ENTITLEMENTS — Stripe IDs ──────────────
ALTER TABLE public.copy_account_entitlements
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS current_period_start    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_copy_entitlements_stripe_sub
  ON public.copy_account_entitlements(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ── 5. STRIPE_WEBHOOK_EVENTS — idempotency ─────────────────
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT        UNIQUE NOT NULL,
  event_type      TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'PROCESSED'
                  CHECK (status IN ('PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type
  ON public.stripe_webhook_events(event_type, created_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stripe_webhook_events_admin_only"
  ON public.stripe_webhook_events FOR ALL
  USING (public.is_admin());
