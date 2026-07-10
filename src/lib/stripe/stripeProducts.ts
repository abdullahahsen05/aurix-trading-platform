import "server-only";

/** Maps a billing_products.billing_interval to Stripe checkout mode. */
export function getStripeCheckoutMode(billingInterval: string): "subscription" | "payment" {
  return billingInterval === "MONTHLY" ? "subscription" : "payment";
}

/**
 * Maps a billing_products.code to the Stripe Price ID stored in env vars.
 * Throws if the env var for that product is not set.
 */
export function getStripePriceId(productCode: string): string {
  const map: Record<string, string | undefined> = {
    PLATFORM_MONTHLY: process.env.STRIPE_PRICE_PLATFORM_MONTHLY,
    COPY_NORMAL: process.env.STRIPE_PRICE_COPY_NORMAL_MONTHLY,
    COPY_ULTRA_FAST: process.env.STRIPE_PRICE_COPY_ULTRA_FAST_MONTHLY,
    BOT_EA: process.env.STRIPE_PRICE_BOT_EA_ONE_TIME,
    MENTORSHIP_1_1: process.env.STRIPE_PRICE_MENTORSHIP_ONE_TIME_EUR,
  };

  const priceId = map[productCode];
  if (!priceId) {
    throw new Error(
      `No Stripe Price ID configured for product "${productCode}". ` +
        `Set STRIPE_PRICE_${productCode.replace(/-/g, "_")} in your environment.`,
    );
  }
  return priceId;
}
