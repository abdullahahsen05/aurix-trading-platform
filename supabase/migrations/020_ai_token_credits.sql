-- Migration 020: Gemini AI token credit system.
-- Every user gets 50,000 credits on registration. Credits are deducted by
-- actual token usage (prompt + completion). Balance cannot go below 0.
-- Admin can top up via the admin AI panel.

-- 1. Add credit balance column to ai_user_limits.
ALTER TABLE public.ai_user_limits
  ADD COLUMN IF NOT EXISTS ai_token_credits BIGINT NOT NULL DEFAULT 50000;

-- 2. Auto-grant row + credits when a new profile is created.
CREATE OR REPLACE FUNCTION public.grant_initial_ai_credits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.ai_user_limits (user_id, ai_token_credits)
  VALUES (NEW.id, 50000)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_initial_ai_credits ON public.profiles;
CREATE TRIGGER trg_grant_initial_ai_credits
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.grant_initial_ai_credits();

-- 3. Backfill: create ai_user_limits rows for existing users who don't have one.
INSERT INTO public.ai_user_limits (user_id, ai_token_credits)
SELECT id, 50000
FROM public.profiles
WHERE id NOT IN (SELECT user_id FROM public.ai_user_limits)
ON CONFLICT (user_id) DO NOTHING;

-- 4. Set 50000 credits for existing rows that have the default 0 (newly added column).
-- Only update rows where credits are exactly 0 to avoid clobbering manually set values.
UPDATE public.ai_user_limits
SET ai_token_credits = 50000
WHERE ai_token_credits = 0;

-- 5. RPC: atomically deduct tokens, floor at 0.
CREATE OR REPLACE FUNCTION public.deduct_ai_credits(p_user_id UUID, p_tokens BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.ai_user_limits (user_id, ai_token_credits)
  VALUES (p_user_id, GREATEST(0, 50000 - p_tokens))
  ON CONFLICT (user_id) DO UPDATE
    SET ai_token_credits = GREATEST(0, public.ai_user_limits.ai_token_credits - p_tokens),
        updated_at = NOW();
END;
$$;

-- 6. RPC: admin top-up.
CREATE OR REPLACE FUNCTION public.topup_ai_credits(p_user_id UUID, p_tokens BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.ai_user_limits (user_id, ai_token_credits)
  VALUES (p_user_id, p_tokens)
  ON CONFLICT (user_id) DO UPDATE
    SET ai_token_credits = public.ai_user_limits.ai_token_credits + p_tokens,
        updated_at = NOW();
END;
$$;
