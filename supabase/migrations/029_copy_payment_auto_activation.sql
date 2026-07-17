-- Phase 6: backfill previously paid copy entitlements into the new automatic
-- activation model. Only rows linked to a server-recorded PAID order qualify.

UPDATE public.copy_account_entitlements AS entitlement
SET
  status = 'ACTIVE',
  approved_at = COALESCE(entitlement.approved_at, payment.paid_at, NOW()),
  approved_by_admin_id = NULL,
  current_period_end = COALESCE(entitlement.current_period_end, NOW() + INTERVAL '1 month')
FROM public.payment_orders AS payment
WHERE entitlement.payment_order_id = payment.id
  AND entitlement.status = 'PENDING_APPROVAL'
  AND payment.status = 'PAID';
