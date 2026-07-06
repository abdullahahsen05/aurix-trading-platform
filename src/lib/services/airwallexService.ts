/**
 * Airwallex server-side service.
 * All calls are made server-side only — API keys never reach the browser.
 *
 * Docs: https://www.airwallex.com/docs/api
 * Auth: POST /authentication/login → bearer token (valid ~30 min, cached here)
 */

const BASE_URL = process.env.AIRWALLEX_API_BASE_URL ?? "https://api-demo.airwallex.com/api/v1";
const CLIENT_ID = process.env.AIRWALLEX_CLIENT_ID ?? "";
const API_KEY = process.env.AIRWALLEX_API_KEY ?? "";

// ─── Token cache ────────────────────────────────────────────────────────────

let _token: string | null = null;
let _tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiresAt - 30_000) return _token;

  const res = await fetch(`${BASE_URL}/authentication/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": CLIENT_ID,
      "x-api-key": API_KEY,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airwallex auth failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { token: string; expires_at: string };
  _token = json.token;
  _tokenExpiresAt = new Date(json.expires_at).getTime();
  return _token;
}

async function awxFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airwallex ${opts.method ?? "GET"} ${path} failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AirwallexPaymentIntent {
  id: string;
  client_secret: string;
  status: string;
  amount: number;
  currency: string;
  merchant_order_id?: string;
}

export interface CreatePaymentIntentParams {
  /** Your internal order ID — used for idempotency on the merchant side. */
  merchantOrderId: string;
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
  customerEmail?: string;
  customerName?: string;
  metadata?: Record<string, string>;
}

// ─── Create PaymentIntent ─────────────────────────────────────────────────────

export async function createPaymentIntent(
  params: CreatePaymentIntentParams,
): Promise<AirwallexPaymentIntent> {
  return awxFetch<AirwallexPaymentIntent>("/pa/payment_intents/create", {
    method: "POST",
    body: JSON.stringify({
      merchant_order_id: params.merchantOrderId,
      request_id: params.merchantOrderId, // idempotency key
      amount: params.amount,
      currency: params.currency,
      description: params.description,
      return_url: params.returnUrl,
      order: {
        products: [{ name: params.description, quantity: 1, unit_price: params.amount }],
      },
      customer: params.customerEmail
        ? {
            email: params.customerEmail,
            name: params.customerName ?? params.customerEmail,
          }
        : undefined,
      metadata: params.metadata,
    }),
  });
}

// ─── Fetch PaymentIntent ──────────────────────────────────────────────────────

export async function getPaymentIntent(intentId: string): Promise<AirwallexPaymentIntent> {
  return awxFetch<AirwallexPaymentIntent>(`/pa/payment_intents/${intentId}`);
}

// ─── Hosted checkout URL ──────────────────────────────────────────────────────

/**
 * Build the Airwallex hosted checkout URL.
 * Demo env: https://checkout-demo.airwallex.com/#/
 * Prod env:  https://checkout.airwallex.com/#/
 */
export function buildCheckoutUrl(intentId: string, clientSecret: string): string {
  const isDemo = (process.env.AIRWALLEX_ENV ?? "demo") !== "prod";
  const base = isDemo
    ? "https://checkout-demo.airwallex.com/#/"
    : "https://checkout.airwallex.com/#/";
  const params = new URLSearchParams({
    intentId,
    clientSecret,
  });
  return `${base}?${params.toString()}`;
}

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Verify an Airwallex webhook payload.
 * Airwallex signs the raw body with HMAC-SHA256 using the webhook secret.
 * The signature is sent in the `x-airwallex-signature` header as a hex string.
 *
 * Returns true if valid (or if no AIRWALLEX_WEBHOOK_SECRET is configured,
 * which allows local dev without a secret — log a warning in that case).
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = process.env.AIRWALLEX_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[airwallex] AIRWALLEX_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }
  if (!signatureHeader) return false;

  // Parse "t=timestamp,v1=signature" format (similar to Stripe)
  // Airwallex may use a simpler hex-only format; handle both:
  let signature = signatureHeader;
  if (signatureHeader.includes("v1=")) {
    const match = /v1=([a-f0-9]+)/i.exec(signatureHeader);
    if (!match) return false;
    signature = match[1];
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const sigBytes = Uint8Array.from(
    signature.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
  );

  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(rawBody));
  return valid;
}
