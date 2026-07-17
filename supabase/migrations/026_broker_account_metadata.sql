-- Migration 026: Persist non-secret broker metadata returned by MetaTrader or
-- supplied during connection. Existing credentials/history remain unchanged.

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS broker_server TEXT;

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS broker_platform TEXT;

ALTER TABLE public.trading_accounts
  DROP CONSTRAINT IF EXISTS trading_accounts_broker_platform_check;

ALTER TABLE public.trading_accounts
  ADD CONSTRAINT trading_accounts_broker_platform_check
  CHECK (broker_platform IS NULL OR broker_platform IN ('MT4', 'MT5'));
