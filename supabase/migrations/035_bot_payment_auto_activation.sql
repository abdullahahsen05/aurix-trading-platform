-- Backfill Bot/EA purchases created under the previous manual-approval model.
-- Only access records backed by a server-recorded PAID Bot/EA order qualify.

UPDATE public.bot_access_records AS access
SET
  status = 'ACTIVE',
  granted_at = COALESCE(access.granted_at, payment.paid_at, NOW()),
  granted_by = NULL
FROM public.payment_orders AS payment
JOIN public.billing_products AS product
  ON product.id = payment.product_id
WHERE access.user_id = payment.user_id
  AND access.product_id = payment.bot_product_id
  AND access.status = 'REQUESTED'
  AND access.source = 'FUTURE_PAYMENT'
  AND payment.status = 'PAID'
  AND product.code = 'BOT_EA';
