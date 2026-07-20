-- Migration 041: seed the managed broker catalog from existing account metadata.
-- This preserves the provider-first connection flow for installations that
-- already had MetaTrader accounts before migration 038 introduced the catalog.

WITH existing_brokers AS (
  SELECT
    CASE
      WHEN regexp_replace(lower(trim(broker_name)), '[^a-z0-9]+', '-', 'g') <> ''
        THEN trim(BOTH '-' FROM regexp_replace(lower(trim(broker_name)), '[^a-z0-9]+', '-', 'g'))
      ELSE 'broker-' || substr(md5(trim(broker_name)), 1, 12)
    END AS name,
    min(trim(broker_name)) AS display_name,
    array_agg(
      DISTINCT CASE
        WHEN upper(coalesce(broker_platform, 'MT5')) = 'MT4' THEN 'MT4'
        ELSE 'MT5'
      END
    )::TEXT[] AS platforms_supported
  FROM public.trading_accounts
  WHERE nullif(trim(broker_name), '') IS NOT NULL
  GROUP BY 1
)
INSERT INTO public.broker_providers (
  name,
  display_name,
  platforms_supported,
  is_active
)
SELECT
  name,
  display_name,
  platforms_supported,
  TRUE
FROM existing_brokers
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  platforms_supported = EXCLUDED.platforms_supported,
  is_active = TRUE,
  updated_at = NOW();

WITH account_servers AS (
  SELECT DISTINCT
    CASE
      WHEN regexp_replace(lower(trim(account.broker_name)), '[^a-z0-9]+', '-', 'g') <> ''
        THEN trim(BOTH '-' FROM regexp_replace(lower(trim(account.broker_name)), '[^a-z0-9]+', '-', 'g'))
      ELSE 'broker-' || substr(md5(trim(account.broker_name)), 1, 12)
    END AS provider_name,
    CASE
      WHEN upper(coalesce(account.broker_platform, 'MT5')) = 'MT4' THEN 'MT4'
      ELSE 'MT5'
    END AS platform,
    trim(account.broker_server) AS server_name
  FROM public.trading_accounts account
  WHERE nullif(trim(account.broker_name), '') IS NOT NULL
    AND nullif(trim(account.broker_server), '') IS NOT NULL
)
INSERT INTO public.broker_servers (
  broker_provider_id,
  platform,
  server_name,
  source,
  is_active
)
SELECT
  provider.id,
  account_servers.platform,
  account_servers.server_name,
  'MANUAL',
  TRUE
FROM account_servers
JOIN public.broker_providers provider
  ON provider.name = account_servers.provider_name
ON CONFLICT (broker_provider_id, platform, server_name) DO UPDATE SET
  is_active = TRUE,
  updated_at = NOW();

UPDATE public.trading_accounts account
SET broker_provider_id = provider.id
FROM public.broker_providers provider
WHERE account.broker_provider_id IS NULL
  AND nullif(trim(account.broker_name), '') IS NOT NULL
  AND provider.name = CASE
    WHEN regexp_replace(lower(trim(account.broker_name)), '[^a-z0-9]+', '-', 'g') <> ''
      THEN trim(BOTH '-' FROM regexp_replace(lower(trim(account.broker_name)), '[^a-z0-9]+', '-', 'g'))
    ELSE 'broker-' || substr(md5(trim(account.broker_name)), 1, 12)
  END;
