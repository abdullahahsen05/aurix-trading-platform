-- Phase 5: distinguish assistant capabilities without storing prompts, replies,
-- images, screenshots, or account payloads in usage logs.

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS feature TEXT;

UPDATE public.ai_usage_logs
SET feature = CASE
  WHEN route = 'chart-analysis' THEN 'TRADER_CHART_ASSISTANT'
  ELSE 'TRADER_ASSISTANT'
END
WHERE feature IS NULL;

ALTER TABLE public.ai_usage_logs
  ALTER COLUMN feature SET NOT NULL;

ALTER TABLE public.ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_feature_check;

ALTER TABLE public.ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_feature_check
  CHECK (feature IN (
    'ADMIN_ASSISTANT',
    'ADMIN_IMAGE_ANALYSIS',
    'TRADER_ASSISTANT',
    'TRADER_CHART_ASSISTANT'
  ));

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_feature_created
  ON public.ai_usage_logs(feature, created_at DESC);
