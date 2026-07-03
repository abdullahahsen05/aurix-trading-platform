-- Migration 018: Add execution tier to copy strategy followers.
-- PREMIUM followers are processed before NORMAL followers in both simulation
-- and live execution. This is an ordering guarantee only — it does not affect
-- broker-level execution latency.

ALTER TABLE public.copy_strategy_followers
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK (tier IN ('NORMAL', 'PREMIUM'));

CREATE INDEX IF NOT EXISTS idx_copy_followers_tier
  ON public.copy_strategy_followers(strategy_id, tier);
