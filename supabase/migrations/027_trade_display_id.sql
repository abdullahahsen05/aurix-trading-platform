-- Phase 3: stable, user-facing trade identifiers.
-- Internal UUIDs remain the primary keys and all existing lifecycle fields are preserved.

CREATE SEQUENCE IF NOT EXISTS public.trade_short_id_seq;

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS short_trade_id TEXT;

ALTER TABLE public.trades
  ALTER COLUMN short_trade_id
  SET DEFAULT ('TRD-' || LPAD(nextval('public.trade_short_id_seq')::TEXT, 8, '0'));

UPDATE public.trades
SET short_trade_id = DEFAULT
WHERE short_trade_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_short_trade_id
  ON public.trades(short_trade_id)
  WHERE short_trade_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trades_account_short_trade_id
  ON public.trades(trading_account_id, short_trade_id);

GRANT USAGE, SELECT ON SEQUENCE public.trade_short_id_seq TO authenticated, service_role;
