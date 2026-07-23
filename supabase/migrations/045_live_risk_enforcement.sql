-- WSA Global live risk enforcement.
-- Adds explicit rule actions and a current enforcement state per account.

ALTER TABLE public.risk_rules
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'WARN';

ALTER TABLE public.risk_rules
  DROP CONSTRAINT IF EXISTS risk_rules_action_check;

ALTER TABLE public.risk_rules
  ADD CONSTRAINT risk_rules_action_check
  CHECK (action IN ('WARN', 'LIMIT', 'RESTRICT'));

-- Existing platform defaults become enforceable:
-- daily loss and drawdown restrict the account; open-trade concentration
-- blocks new WSA copy openings without preventing closes.
UPDATE public.risk_rules
SET action = CASE
  WHEN metric IN ('DAILY_LOSS', 'MAX_DRAWDOWN') THEN 'RESTRICT'
  WHEN metric = 'OPEN_TRADES' THEN 'LIMIT'
  ELSE 'WARN'
END
WHERE action = 'WARN';

-- Remove duplicate rules left by repeated demo seeding. Keep the most recently
-- updated row for each platform/account metric before adding uniqueness.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY trading_account_id, metric
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM public.risk_rules
)
DELETE FROM public.risk_rules
WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_rules_platform_metric_unique
  ON public.risk_rules(metric)
  WHERE trading_account_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_rules_account_metric_unique
  ON public.risk_rules(trading_account_id, metric)
  WHERE trading_account_id IS NOT NULL;

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS risk_restricted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS risk_restriction_reason TEXT;

CREATE TABLE IF NOT EXISTS public.account_risk_states (
  trading_account_id UUID PRIMARY KEY
    REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  blocked_new_trades BOOLEAN NOT NULL DEFAULT FALSE,
  restricted BOOLEAN NOT NULL DEFAULT FALSE,
  breached_rules JSONB NOT NULL DEFAULT '[]'::JSONB,
  source TEXT NOT NULL DEFAULT 'SYNC'
    CHECK (source IN ('SYNC', 'METAAPI_STREAM', 'COPY_PREFLIGHT')),
  last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_risk_states_blocked
  ON public.account_risk_states(blocked_new_trades)
  WHERE blocked_new_trades = TRUE;

ALTER TABLE public.account_risk_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_risk_states_select" ON public.account_risk_states;
CREATE POLICY "account_risk_states_select"
  ON public.account_risk_states FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.trading_accounts account
      WHERE account.id = account_risk_states.trading_account_id
        AND account.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "account_risk_states_admin_write" ON public.account_risk_states;
CREATE POLICY "account_risk_states_admin_write"
  ON public.account_risk_states FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.account_risk_states;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add account_risk_states to realtime: %', SQLERRM;
END $$;
