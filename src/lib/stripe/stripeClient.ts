import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  _stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
  return _stripe;
}

export async function ensureStripeCustomer(
  userId: string,
  email: string,
  name: string,
): Promise<string> {
  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id as string;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name: name || email,
    metadata: { userId },
  });

  await supabase
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}
