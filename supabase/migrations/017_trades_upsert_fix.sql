-- Migration 017: Replace partial unique index on trades with a full unique
-- constraint so that PostgREST upsert (ON CONFLICT col1,col2) resolves correctly.
--
-- The partial index (WHERE external_trade_id IS NOT NULL) cannot be used as an
-- ON CONFLICT target by PostgREST — it requires a named constraint or a
-- non-partial unique index. Semantics are identical: PostgreSQL UNIQUE treats
-- NULLs as distinct, so multiple rows with external_trade_id IS NULL for the
-- same account remain allowed.

DROP INDEX IF EXISTS public.idx_trades_account_external;

ALTER TABLE public.trades
  ADD CONSTRAINT uq_trades_account_external_id
  UNIQUE (trading_account_id, external_trade_id);
