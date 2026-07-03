-- Migration 021: Partner commission rule type.
-- Adds commission_type and cpa_amount to partner_profiles so the partner
-- dashboard can display the rule structure alongside the ledger.
-- Additive + idempotent.

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS commission_type TEXT NOT NULL DEFAULT 'REBATE'
    CHECK (commission_type IN ('CPA', 'REBATE', 'PROFIT_SHARE'));

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS cpa_amount NUMERIC(10,2);
