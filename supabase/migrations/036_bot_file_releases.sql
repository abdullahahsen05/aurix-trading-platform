-- Private, versioned Bot/EA file delivery.

-- Legacy direct URLs bypass protected access checks and are no longer used.
UPDATE public.bot_products
SET download_url = NULL
WHERE download_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.bot_file_releases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES public.bot_products(id) ON DELETE CASCADE,
  version           TEXT NOT NULL CHECK (char_length(TRIM(version)) BETWEEN 1 AND 30),
  platform          TEXT NOT NULL CHECK (platform IN ('MT4', 'MT5')),
  status            TEXT NOT NULL DEFAULT 'PUBLISHED'
                    CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  storage_path      TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type         TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size         BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 52428800),
  checksum_sha256   TEXT NOT NULL CHECK (char_length(checksum_sha256) = 64),
  release_notes     TEXT NULL CHECK (release_notes IS NULL OR char_length(release_notes) <= 2000),
  uploaded_by       UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at      TIMESTAMPTZ NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_file_releases_product_published
  ON public.bot_file_releases(product_id, published_at DESC, created_at DESC)
  WHERE status = 'PUBLISHED';

CREATE OR REPLACE TRIGGER trg_bot_file_releases_updated_at
  BEFORE UPDATE ON public.bot_file_releases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bot_file_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_file_releases_admin_all" ON public.bot_file_releases;
CREATE POLICY "bot_file_releases_admin_all"
  ON public.bot_file_releases FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No trader storage/table policy is created. Downloads are authorized by a
-- server route and use a short-lived signed URL from this private bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('bot-files', 'bot-files', FALSE, 52428800)
ON CONFLICT (id) DO UPDATE
SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit;
