import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/services/airwallexService";
import {
  handlePaymentSucceeded,
  expireStaleEntitlements,
} from "@/lib/services/billingService";
import { createAdminClient } from "@/lib/supabase/admin";

interface AirwallexWebhookEvent {
  name: string;
  data: {
    object: {
      id: string;
      status?: string;
      merchant_order_id?: string;
    };
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-airwallex-signature");

  const valid = await verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    console.warn("[webhook/airwallex] invalid signature");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: AirwallexWebhookEvent;
  try {
    event = JSON.parse(rawBody) as AirwallexWebhookEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const intentId = event.data?.object?.id;
  const eventName = event.name ?? "";

  try {
    if (eventName === "payment_intent.succeeded" || event.data?.object?.status === "SUCCEEDED") {
      await handlePaymentSucceeded(intentId);
      // Also run expiry check opportunistically
      await expireStaleEntitlements().catch(() => {});
    } else if (
      eventName === "payment_intent.cancelled" ||
      event.data?.object?.status === "CANCELLED"
    ) {
      await updateOrderStatus(intentId, "CANCELLED");
    } else if (
      eventName === "payment_intent.failed" ||
      event.data?.object?.status === "FAILED"
    ) {
      await updateOrderStatus(intentId, "FAILED");
    }
    // Unrecognised events are accepted silently (200) to prevent Airwallex retries
  } catch (err) {
    console.error("[webhook/airwallex] processing error:", err);
    // Return 200 to prevent infinite retries; log internally
  }

  return NextResponse.json({ received: true });
}

async function updateOrderStatus(intentId: string, status: string) {
  if (!intentId) return;
  const supabase = createAdminClient();
  await supabase
    .from("payment_orders")
    .update({ status })
    .eq("provider_payment_intent_id", intentId)
    .neq("status", "PAID"); // never downgrade a PAID order
}
