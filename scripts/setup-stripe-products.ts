/**
 * One-time setup script: create Stripe Products and Prices for Aurix in TEST MODE.
 *
 * Usage:
 *   npx tsx scripts/setup-stripe-products.ts
 *
 * Prerequisites:
 *   - STRIPE_SECRET_KEY must be set (sk_test_...)
 *   - Run only against Stripe test mode
 *
 * Output: prints the Price IDs — copy them to .env.local as:
 *   STRIPE_PRICE_PLATFORM_MONTHLY=price_...
 *   etc.
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("ERROR: STRIPE_SECRET_KEY is not set");
  process.exit(1);
}
if (!key.startsWith("sk_test_")) {
  console.error("ERROR: This script must use a TEST mode key (sk_test_...). Refusing to run on live keys.");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });

interface ProductSpec {
  envVar: string;
  productName: string;
  amount: number;
  currency: string;
  interval?: "month";
  description?: string;
}

const products: ProductSpec[] = [
  {
    envVar: "STRIPE_PRICE_PLATFORM_MONTHLY",
    productName: "Aurix Platform Subscription",
    amount: 5000, // cents
    currency: "usd",
    interval: "month",
    description: "Full access to all Aurix platform features",
  },
  {
    envVar: "STRIPE_PRICE_COPY_NORMAL_MONTHLY",
    productName: "Aurix Copy Trading — Normal",
    amount: 1000,
    currency: "usd",
    interval: "month",
    description: "Copy trading account — Normal tier",
  },
  {
    envVar: "STRIPE_PRICE_COPY_ULTRA_FAST_MONTHLY",
    productName: "Aurix Copy Trading — Ultra Fast",
    amount: 1500,
    currency: "usd",
    interval: "month",
    description: "Copy trading account — Ultra Fast (Premium) tier",
  },
  {
    envVar: "STRIPE_PRICE_BOT_EA_ONE_TIME",
    productName: "WSA Global Trading Bot / EA",
    amount: 50000,
    currency: "usd",
    description: "One-time purchase — lifetime bot/EA access after verified payment",
  },
  {
    envVar: "STRIPE_PRICE_MENTORSHIP_ONE_TIME_EUR",
    productName: "Aurix 1-to-1 Professional Mentorship",
    amount: 250000, // 2500 EUR in cents
    currency: "eur",
    description: "Private 1-on-1 mentorship with a professional trader",
  },
];

async function run() {
  console.log("Setting up Stripe products/prices in TEST mode...\n");

  const results: Record<string, string> = {};

  for (const spec of products) {
    const product = await stripe.products.create({
      name: spec.productName,
      description: spec.description,
    });

    const priceData: Stripe.PriceCreateParams = {
      product: product.id,
      unit_amount: spec.amount,
      currency: spec.currency,
    };

    if (spec.interval) {
      priceData.recurring = { interval: spec.interval };
    }

    const price = await stripe.prices.create(priceData);
    results[spec.envVar] = price.id;
    console.log(`✓ ${spec.productName}`);
    console.log(`  Product: ${product.id}`);
    console.log(`  Price:   ${price.id}`);
    console.log();
  }

  console.log("─────────────────────────────────────────────");
  console.log("Add these to your .env.local:\n");
  for (const [envVar, priceId] of Object.entries(results)) {
    console.log(`${envVar}=${priceId}`);
  }
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
