-- ============================================================
-- 015_evaluations.sql  –  Evaluation & Certification Program
-- ============================================================

-- ── EVALUATION PROGRAMS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.evaluation_programs (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                          TEXT UNIQUE NOT NULL,
  name                          TEXT NOT NULL,
  description                   TEXT,
  required_course_id            UUID REFERENCES public.academy_courses(id) ON DELETE SET NULL,
  starting_balance              NUMERIC(18,2) NOT NULL DEFAULT 10000,
  profit_target_percent         NUMERIC(7,2) NOT NULL DEFAULT 8,
  max_daily_drawdown_percent    NUMERIC(7,2) NOT NULL DEFAULT 5,
  max_overall_drawdown_percent  NUMERIC(7,2) NOT NULL DEFAULT 10,
  minimum_trading_days          INTEGER NOT NULL DEFAULT 5,
  duration_days                 INTEGER NOT NULL DEFAULT 30,
  status                        TEXT NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  rules                         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by                    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_programs_status     ON public.evaluation_programs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_programs_slug       ON public.evaluation_programs(slug);

CREATE OR REPLACE TRIGGER trg_eval_programs_updated_at
  BEFORE UPDATE ON public.evaluation_programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── EVALUATION ATTEMPTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.evaluation_attempts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id            UUID NOT NULL REFERENCES public.evaluation_programs(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trading_account_id    UUID REFERENCES public.trading_accounts(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','ACTIVE','PASSED','FAILED','EXPIRED','CANCELLED','NEEDS_REVIEW')),
  starting_balance      NUMERIC(18,2),
  started_at            TIMESTAMPTZ,
  ends_at               TIMESTAMPTZ,
  passed_at             TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  pass_reason           TEXT,
  fail_reason           TEXT,
  latest_metrics        JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at       TIMESTAMPTZ,
  admin_override_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_override_reason TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_attempts_user_status   ON public.evaluation_attempts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_eval_attempts_program_status ON public.evaluation_attempts(program_id, status);
CREATE INDEX IF NOT EXISTS idx_eval_attempts_account       ON public.evaluation_attempts(trading_account_id);
CREATE INDEX IF NOT EXISTS idx_eval_attempts_status_check  ON public.evaluation_attempts(status, last_checked_at);

CREATE OR REPLACE TRIGGER trg_eval_attempts_updated_at
  BEFORE UPDATE ON public.evaluation_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── EVALUATION CHECKS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.evaluation_checks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    UUID NOT NULL REFERENCES public.evaluation_attempts(id) ON DELETE CASCADE,
  status_before TEXT,
  status_after  TEXT,
  metrics       JSONB NOT NULL DEFAULT '{}'::jsonb,
  result        TEXT NOT NULL
                CHECK (result IN ('NO_CHANGE','PASSED','FAILED','EXPIRED','NEEDS_REVIEW')),
  reason        TEXT,
  checked_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source        TEXT NOT NULL DEFAULT 'SYSTEM'
                CHECK (source IN ('SYSTEM','ADMIN','WORKER')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_checks_attempt_at ON public.evaluation_checks(attempt_id, created_at DESC);

-- ── EVALUATION CERTIFICATES ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.evaluation_certificates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id        UUID NOT NULL REFERENCES public.evaluation_attempts(id) ON DELETE CASCADE,
  program_id        UUID NOT NULL REFERENCES public.evaluation_programs(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  verification_id   TEXT UNIQUE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'VALID'
                    CHECK (status IN ('VALID','REVOKED')),
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ,
  revoked_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revocation_reason TEXT,
  pdf_url           TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(attempt_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_certs_user_status  ON public.evaluation_certificates(user_id, status);
CREATE INDEX IF NOT EXISTS idx_eval_certs_verification ON public.evaluation_certificates(verification_id);
CREATE INDEX IF NOT EXISTS idx_eval_certs_program_date ON public.evaluation_certificates(program_id, issued_at DESC);

CREATE OR REPLACE TRIGGER trg_eval_certs_updated_at
  BEFORE UPDATE ON public.evaluation_certificates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.evaluation_programs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_checks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_certificates ENABLE ROW LEVEL SECURITY;

-- Programs: traders and public can read PUBLISHED programs
CREATE POLICY "eval_programs_published_read"
  ON public.evaluation_programs FOR SELECT
  USING (status = 'PUBLISHED');

-- Attempts: trader sees their own
CREATE POLICY "eval_attempts_trader_read"
  ON public.evaluation_attempts FOR SELECT
  USING (user_id = auth.uid());

-- Checks: trader sees checks on their own attempts
CREATE POLICY "eval_checks_trader_read"
  ON public.evaluation_checks FOR SELECT
  USING (
    attempt_id IN (
      SELECT id FROM public.evaluation_attempts WHERE user_id = auth.uid()
    )
  );

-- Certificates: trader sees their own valid certs; revoked still readable by owner
CREATE POLICY "eval_certs_trader_read"
  ON public.evaluation_certificates FOR SELECT
  USING (user_id = auth.uid());
