-- ============================================================
-- AURIX Trading Platform — Migration 013
-- Phase 5: Trading Bot Marketplace + MT5 Account-Locked Licensing
-- Additive + idempotent.
-- ============================================================

-- Ensure is_partner() exists (idempotent — may already exist from 008)
CREATE OR REPLACE FUNCTION public.is_partner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'PARTNER'
      AND status = 'ACTIVE'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── BOT_PRODUCTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bot_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  short_description TEXT,
  description       TEXT,
  features          JSONB NOT NULL DEFAULT '[]'::JSONB,
  platform          TEXT NOT NULL DEFAULT 'MT5'
                    CHECK (platform IN ('MT5', 'MT4', 'BOTH')),
  status            TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  price_amount      NUMERIC(12,2) NULL,
  price_currency    TEXT NOT NULL DEFAULT 'USD',
  pricing_label     TEXT NULL,
  difficulty        TEXT NULL
                    CHECK (difficulty IS NULL OR difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  risk_level        TEXT NULL
                    CHECK (risk_level IS NULL OR risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  screenshot_urls   JSONB NOT NULL DEFAULT '[]'::JSONB,
  video_url         TEXT NULL,
  download_url      TEXT NULL,
  version           TEXT NULL,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_products_status ON public.bot_products(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_products_slug   ON public.bot_products(slug);

CREATE OR REPLACE TRIGGER trg_bot_products_updated_at
  BEFORE UPDATE ON public.bot_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bot_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_products_admin_all"
  ON public.bot_products FOR ALL
  USING (public.is_admin());

-- Active users (traders/partners) may read PUBLISHED products
CREATE POLICY "bot_products_published_select"
  ON public.bot_products FOR SELECT
  USING (status = 'PUBLISHED' AND public.is_active_user() AND NOT public.is_admin());

-- ── BOT_ACCESS_RECORDS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bot_access_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES public.bot_products(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  partner_id      UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'REQUESTED'
                  CHECK (status IN ('REQUESTED', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED')),
  source          TEXT NOT NULL DEFAULT 'REQUEST'
                  CHECK (source IN ('REQUEST', 'MANUAL', 'FUTURE_PAYMENT')),
  price_amount    NUMERIC(12,2) NULL,
  price_currency  TEXT NOT NULL DEFAULT 'USD',
  granted_by      UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at      TIMESTAMPTZ NULL,
  expires_at      TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_access_user_status    ON public.bot_access_records(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_access_product_status ON public.bot_access_records(product_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_access_partner        ON public.bot_access_records(partner_id, created_at DESC)
  WHERE partner_id IS NOT NULL;

CREATE OR REPLACE TRIGGER trg_bot_access_updated_at
  BEFORE UPDATE ON public.bot_access_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bot_access_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_access_admin_all"
  ON public.bot_access_records FOR ALL
  USING (public.is_admin());

CREATE POLICY "bot_access_trader_select"
  ON public.bot_access_records FOR SELECT
  USING (user_id = auth.uid() AND public.is_active_user() AND NOT public.is_admin());

-- Traders may insert only their own REQUESTED records
CREATE POLICY "bot_access_trader_insert"
  ON public.bot_access_records FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'REQUESTED'
    AND source = 'REQUEST'
    AND granted_by IS NULL
    AND public.is_active_user()
    AND NOT public.is_admin()
  );

-- ── BOT_LICENSES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bot_licenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES public.bot_products(id) ON DELETE CASCADE,
  access_record_id    UUID NOT NULL REFERENCES public.bot_access_records(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  license_key_hash    TEXT NOT NULL UNIQUE,
  license_key_last4   TEXT NOT NULL,
  mt5_account_number  TEXT NOT NULL,
  platform            TEXT NOT NULL DEFAULT 'MT5',
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'REVOKED', 'SUSPENDED', 'EXPIRED')),
  issued_by           UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NULL,
  revoked_at          TIMESTAMPTZ NULL,
  revoked_by          UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  reissue_of          UUID NULL REFERENCES public.bot_licenses(id) ON DELETE SET NULL,
  metadata            JSONB NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_licenses_user_status ON public.bot_licenses(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_licenses_product     ON public.bot_licenses(product_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_licenses_key_hash    ON public.bot_licenses(license_key_hash);
CREATE INDEX IF NOT EXISTS idx_bot_licenses_mt5         ON public.bot_licenses(mt5_account_number);
CREATE INDEX IF NOT EXISTS idx_bot_licenses_access      ON public.bot_licenses(access_record_id);

CREATE OR REPLACE TRIGGER trg_bot_licenses_updated_at
  BEFORE UPDATE ON public.bot_licenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bot_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_licenses_admin_all"
  ON public.bot_licenses FOR ALL
  USING (public.is_admin());

CREATE POLICY "bot_licenses_trader_select"
  ON public.bot_licenses FOR SELECT
  USING (user_id = auth.uid() AND public.is_active_user() AND NOT public.is_admin());

-- ── BOT_LICENSE_VERIFICATION_LOGS ────────────────────────────
CREATE TABLE IF NOT EXISTS public.bot_license_verification_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id          UUID NULL REFERENCES public.bot_licenses(id) ON DELETE SET NULL,
  product_id          UUID NULL REFERENCES public.bot_products(id) ON DELETE SET NULL,
  mt5_account_number  TEXT NULL,
  bot_identifier      TEXT NULL,
  platform            TEXT NULL,
  version             TEXT NULL,
  valid               BOOLEAN NOT NULL DEFAULT FALSE,
  reason              TEXT NOT NULL,
  ip_hash             TEXT NULL,
  user_agent_hash     TEXT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verify_logs_created ON public.bot_license_verification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verify_logs_license ON public.bot_license_verification_logs(license_id, created_at DESC)
  WHERE license_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_verify_logs_product ON public.bot_license_verification_logs(product_id, created_at DESC)
  WHERE product_id IS NOT NULL;

ALTER TABLE public.bot_license_verification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verify_logs_admin_select"
  ON public.bot_license_verification_logs FOR SELECT
  USING (public.is_admin());
