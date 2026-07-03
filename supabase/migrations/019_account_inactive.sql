-- Migration 019: Add INACTIVE status for admin-deactivated MetaAPI accounts
-- and deactivated_at tracking column.
--
-- INACTIVE means: admin intentionally undeployed the MetaAPI account to stop
-- billing. Credentials are preserved. Account can be reactivated.
-- DISCONNECTED remains for automatic/broker-side disconnections.

ALTER TABLE public.trading_accounts
  DROP CONSTRAINT IF EXISTS trading_accounts_status_check;

ALTER TABLE public.trading_accounts
  ADD CONSTRAINT trading_accounts_status_check
    CHECK (status IN ('PENDING','CONNECTED','SYNCING','DISCONNECTED','RESTRICTED','INACTIVE'));

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
