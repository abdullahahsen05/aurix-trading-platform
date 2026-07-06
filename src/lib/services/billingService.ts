/**
 * Billing service — orchestrates Airwallex PaymentIntents, payment_orders,
 * subscriptions, copy_account_entitlements, and partner commission ledger.
 * Server-only.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentIntent, buildCheckoutUrl } from "@/lib/services/airwallexService";
import { writeAuditLog } from "@/lib/services/auditService";

// ─── Public DTOs ──────────────────────────────────────────────────────────────

export interface BillingProductDto {
  id: string;
  code: string;
  name: string;
  type: string;
  amount: number;
  currency: string;
  billingInterval: string;
}

export interface PaymentOrderDto {
  id: string;
  productCode: string;
  productName: string;
  amount: number;
  currency: string;
  status: string;
  checkoutUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  botProductId: string | null;
  tradingAccountId: string | null;
}

export interface BotAccessDto {
  id: string;
  botProductId: string;
  botName: string;
  status: string;
  grantedAt: string | null;
}

export interface SubscriptionDto {
  id: string;
  productCode: string;
  productName: string;
  status: string;
  currentPeriodEnd: string | null;
  approvedAt: string | null;
}

export interface CopyEntitlementDto {
  id: string;
  tier: string;
  status: string;
  tradingAccountId: string | null;
  currentPeriodEnd: string | null;
  approvedAt: string | null;
}

export interface UserBillingSummaryDto {
  platformSubscription: SubscriptionDto | null;
  copyEntitlements: CopyEntitlementDto[];
  paymentHistory: PaymentOrderDto[];
  botAccess: BotAccessDto[];
  pendingApprovals: Array<{
    type: string;
    orderId: string;
    productName: string;
    paidAt: string;
  }>;
}

// ─── Access check ────────────────────────────────────────────────────────────

export type AccessStatus =
  | "NONE"
  | "PENDING_PAYMENT"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED";

export interface ExistingAccessResult {
  status: AccessStatus;
  message: string;
}

/** Returns NONE if the user may purchase; otherwise returns the blocking status. */
export async function checkExistingAccess(
  userId: string,
  productCode: string,
  options?: { tradingAccountId?: string; botProductId?: string },
): Promise<ExistingAccessResult> {
  const supabase = createAdminClient();
  const product = await getProductByCode(productCode);
  if (!product) return { status: "NONE", message: "" };

  if (product.type === "SUBSCRIPTION") {
    const { data } = await supabase
      .from("subscriptions")
      .select("id, status")
      .eq("user_id", userId)
      .in("status", ["ACTIVE", "PENDING_APPROVAL"])
      .limit(1);
    const row = ((data ?? []) as Array<{ status: string }>)[0];
    if (!row) return { status: "NONE", message: "" };
    if (row.status === "ACTIVE") return { status: "ACTIVE", message: "Subscription already active" };
    return { status: "PENDING_APPROVAL", message: "Payment received — pending admin approval" };
  }

  if (product.type === "COPY_ACCOUNT") {
    let q = supabase
      .from("copy_account_entitlements")
      .select("id, status")
      .eq("user_id", userId)
      .in("status", ["ACTIVE", "PENDING_APPROVAL"]);
    if (options?.tradingAccountId) q = q.eq("trading_account_id", options.tradingAccountId);
    const { data } = await q.limit(1);
    const row = ((data ?? []) as Array<{ status: string }>)[0];
    if (!row) return { status: "NONE", message: "" };
    if (row.status === "ACTIVE") return { status: "ACTIVE", message: "Copy trading access already active" };
    return { status: "PENDING_APPROVAL", message: "Payment received — pending admin approval" };
  }

  if (product.type === "BOT") {
    if (options?.botProductId) {
      const { data: bar } = await supabase
        .from("bot_access_records")
        .select("id, status")
        .eq("user_id", userId)
        .eq("product_id", options.botProductId)
        .in("status", ["ACTIVE", "REQUESTED"])
        .limit(1);
      const rec = ((bar ?? []) as Array<{ status: string }>)[0];
      if (rec?.status === "ACTIVE") return { status: "ACTIVE", message: "Bot access already granted" };
      if (rec?.status === "REQUESTED") return { status: "PENDING_APPROVAL", message: "Payment received — pending admin approval" };
    }
    const { data: orders } = await supabase
      .from("payment_orders")
      .select("id, status")
      .eq("user_id", userId)
      .eq("product_id", product.id)
      .in("status", ["PENDING", "PAID"])
      .limit(1);
    const order = ((orders ?? []) as Array<{ status: string }>)[0];
    if (!order) return { status: "NONE", message: "" };
    if (order.status === "PAID") return { status: "PENDING_APPROVAL", message: "Payment received — pending admin approval" };
    return { status: "PENDING_PAYMENT", message: "Payment already pending" };
  }

  // MENTORSHIP / EVALUATION
  const { data: orders } = await supabase
    .from("payment_orders")
    .select("id, status")
    .eq("user_id", userId)
    .eq("product_id", product.id)
    .in("status", ["PENDING", "PAID"])
    .limit(1);
  const order = ((orders ?? []) as Array<{ status: string }>)[0];
  if (!order) return { status: "NONE", message: "" };
  if (order.status === "PAID") return { status: "PENDING_APPROVAL", message: "Payment received — pending admin approval" };
  return { status: "PENDING_PAYMENT", message: "Payment already pending" };
}

// ─── Product lookup ───────────────────────────────────────────────────────────

export async function getBillingProducts(): Promise<BillingProductDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("billing_products")
    .select("id, code, name, type, amount, currency, billing_interval")
    .eq("active", true)
    .order("amount");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    type: p.type,
    amount: Number(p.amount),
    currency: p.currency,
    billingInterval: p.billing_interval,
  }));
}

export async function getProductByCode(code: string): Promise<BillingProductDto | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("billing_products")
    .select("id, code, name, type, amount, currency, billing_interval")
    .eq("code", code)
    .eq("active", true)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    code: data.code,
    name: data.name,
    type: data.type,
    amount: Number(data.amount),
    currency: data.currency,
    billingInterval: data.billing_interval,
  };
}

// ─── Create checkout session ──────────────────────────────────────────────────

export interface CreateCheckoutParams {
  userId: string;
  userEmail: string;
  userName: string;
  productCode: string;
  /** Required for COPY_ACCOUNT products */
  tradingAccountId?: string;
  /** NORMAL or PREMIUM for copy products */
  tier?: string;
  /** Required for BOT products — the bot_products.id */
  botProductId?: string;
  /** Full URL Airwallex redirects to after payment */
  returnUrl: string;
}

export interface CheckoutResult {
  orderId: string;
  checkoutUrl: string;
}

export async function createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutResult> {
  const product = await getProductByCode(params.productCode);
  if (!product) throw new Error("Product not found or inactive");
  if (product.billingInterval === "FREE") throw new Error("This product is free — no payment needed");

  const supabase = createAdminClient();

  // Create the payment_order record first (PENDING)
  const { data: order, error: orderErr } = await supabase
    .from("payment_orders")
    .insert({
      user_id: params.userId,
      product_id: product.id,
      amount: product.amount,
      currency: product.currency,
      status: "PENDING",
      provider: "AIRWALLEX",
      trading_account_id: params.tradingAccountId ?? null,
      tier: params.tier ?? null,
      bot_product_id: params.botProductId ?? null,
    })
    .select("id")
    .single();

  if (orderErr || !order) throw new Error(`Failed to create payment order: ${orderErr?.message}`);

  // TEST MODE: skip Airwallex, wire up the intent ID, then let handlePaymentSucceeded
  // run the normal PENDING→PAID transition and create the subscription/entitlement row.
  // Do NOT pre-mark as PAID here — handlePaymentSucceeded bails early if it sees PAID.
  if (process.env.AIRWALLEX_TEST_MODE === "true") {
    const testIntentId = `test_${order.id}`;
    const testCheckoutUrl = `${params.returnUrl}?orderId=${order.id}&test=1`;
    await supabase
      .from("payment_orders")
      .update({
        provider_payment_intent_id: testIntentId,
        provider_checkout_url: testCheckoutUrl,
      })
      .eq("id", order.id);
    await handlePaymentSucceeded(testIntentId);
    return { orderId: order.id, checkoutUrl: testCheckoutUrl };
  }

  // Create Airwallex PaymentIntent
  const intent = await createPaymentIntent({
    merchantOrderId: order.id,
    amount: product.amount,
    currency: product.currency,
    description: product.name,
    returnUrl: `${params.returnUrl}?orderId=${order.id}`,
    customerEmail: params.userEmail,
    customerName: params.userName,
    metadata: {
      orderId: order.id,
      userId: params.userId,
      productCode: params.productCode,
    },
  });

  const checkoutUrl = buildCheckoutUrl(intent.id, intent.client_secret);

  // Persist intent ID and checkout URL on the order
  await supabase
    .from("payment_orders")
    .update({
      provider_payment_intent_id: intent.id,
      provider_checkout_url: checkoutUrl,
    })
    .eq("id", order.id);

  return { orderId: order.id, checkoutUrl };
}

// ─── Webhook: handle payment succeeded ───────────────────────────────────────

export async function handlePaymentSucceeded(intentId: string): Promise<void> {
  const supabase = createAdminClient();

  // Find the order (idempotent — already PAID means skip)
  const { data: order, error: orderErr } = await supabase
    .from("payment_orders")
    .select("id, user_id, product_id, status, amount, currency, trading_account_id, tier, bot_product_id")
    .eq("provider_payment_intent_id", intentId)
    .single();

  if (orderErr || !order) {
    console.warn(`[billing] handlePaymentSucceeded: no order for intent ${intentId}`);
    return;
  }
  if (order.status === "PAID") return; // already processed

  // Mark order as PAID
  await supabase
    .from("payment_orders")
    .update({ status: "PAID", paid_at: new Date().toISOString() })
    .eq("id", order.id);

  // Get product type
  const { data: product } = await supabase
    .from("billing_products")
    .select("type, billing_interval, code")
    .eq("id", order.product_id)
    .single();

  if (!product) return;

  const pEnd = product.billing_interval === "MONTHLY"
    ? new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  if (product.type === "SUBSCRIPTION") {
    await supabase.from("subscriptions").insert({
      user_id: order.user_id,
      product_id: order.product_id,
      payment_order_id: order.id,
      status: "PENDING_APPROVAL",
      current_period_end: pEnd,
    });
  } else if (product.type === "COPY_ACCOUNT") {
    await supabase.from("copy_account_entitlements").insert({
      user_id: order.user_id,
      trading_account_id: order.trading_account_id ?? null,
      payment_order_id: order.id,
      tier: order.tier ?? (product.code === "COPY_ULTRA_FAST" ? "PREMIUM" : "NORMAL"),
      status: "PENDING_APPROVAL",
      amount: order.amount,
      currency: order.currency,
      current_period_end: pEnd,
    });
  } else if (product.type === "BOT" && order.bot_product_id) {
    await supabase.from("bot_access_records").insert({
      product_id: order.bot_product_id,
      user_id: order.user_id,
      status: "REQUESTED",
      source: "FUTURE_PAYMENT",
      price_amount: order.amount,
      price_currency: order.currency,
    });
  }
  // MENTORSHIP / EVALUATION: just leave the payment_order as proof of payment;
  // admin handles fulfillment manually.

  // ── Partner commission ────────────────────────────────────
  await maybeCreatePartnerCommission(order.user_id, order.id, order.amount, order.currency);
}

async function maybeCreatePartnerCommission(
  userId: string,
  purchaseId: string,
  grossAmount: number,
  currency: string,
): Promise<void> {
  const supabase = createAdminClient();

  // Find assigned partner for this trader
  const { data: tp } = await supabase
    .from("trader_profiles")
    .select("partner_id")
    .eq("user_id", userId)
    .single();

  if (!tp?.partner_id) return;

  // Get commission %
  const { data: pp } = await supabase
    .from("partner_profiles")
    .select("commission_percent, commission_type")
    .eq("user_id", tp.partner_id)
    .single();

  if (!pp) return;

  const commissionAmount = Number(grossAmount) * (Number(pp.commission_percent ?? 0) / 100);
  const now = new Date();
  const payoutMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  await supabase.from("partner_commissions").insert({
    partner_id: tp.partner_id,
    trader_id: userId,
    purchase_id: purchaseId,
    source_type: "PAYMENT",
    source_id: purchaseId,
    gross_amount: grossAmount,
    commission_percent: pp.commission_percent ?? 0,
    commission_amount: commissionAmount,
    currency,
    status: "PENDING",
    payout_month: payoutMonth,
  });
}

// ─── User billing summary ─────────────────────────────────────────────────────

export async function getUserBillingSummary(userId: string): Promise<UserBillingSummaryDto> {
  const supabase = createAdminClient();

  const [{ data: subs }, { data: entitlements }, { data: orders }, { data: botRecs }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, status, current_period_end, approved_at, billing_products(code, name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),

    supabase
      .from("copy_account_entitlements")
      .select("id, tier, status, trading_account_id, current_period_end, approved_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("payment_orders")
      .select("id, status, amount, currency, paid_at, created_at, provider_checkout_url, trading_account_id, bot_product_id, billing_products(code, name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("bot_access_records")
      .select("id, product_id, status, granted_at, bot_products(name)")
      .eq("user_id", userId)
      .in("status", ["ACTIVE", "REQUESTED"])
      .limit(20),
  ]);

  type SubRow = {
    id: string;
    status: string;
    current_period_end: string | null;
    approved_at: string | null;
    billing_products: { code: string; name: string } | null;
  };

  type EntRow = {
    id: string;
    tier: string;
    status: string;
    trading_account_id: string | null;
    current_period_end: string | null;
    approved_at: string | null;
  };

  type OrderRow = {
    id: string;
    status: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    created_at: string;
    provider_checkout_url: string | null;
    trading_account_id: string | null;
    bot_product_id: string | null;
    billing_products: { code: string; name: string } | null;
  };

  type BotRecRow = {
    id: string;
    product_id: string;
    status: string;
    granted_at: string | null;
    bot_products: { name: string } | null;
  };

  const platformSub = ((subs ?? []) as unknown as SubRow[]).find(
    (s) => s.status === "ACTIVE" || s.status === "PENDING_APPROVAL",
  );

  const allSubs = (subs ?? []) as unknown as SubRow[];
  const allEnts = (entitlements ?? []) as unknown as EntRow[];
  const allOrders = (orders ?? []) as unknown as OrderRow[];
  const allBotRecs = (botRecs ?? []) as unknown as BotRecRow[];

  const pendingApprovals = [
    ...allSubs
      .filter((s) => s.status === "PENDING_APPROVAL")
      .map((s) => ({
        type: "SUBSCRIPTION",
        orderId: s.id,
        productName: s.billing_products?.name ?? "Platform Subscription",
        paidAt: "",
      })),
    ...allEnts
      .filter((e) => e.status === "PENDING_APPROVAL")
      .map((e) => ({
        type: "COPY_ENTITLEMENT",
        orderId: e.id,
        productName: `Copy Trading (${e.tier})`,
        paidAt: "",
      })),
  ];

  return {
    platformSubscription: platformSub
      ? {
          id: platformSub.id,
          productCode: platformSub.billing_products?.code ?? "",
          productName: platformSub.billing_products?.name ?? "",
          status: platformSub.status,
          currentPeriodEnd: platformSub.current_period_end,
          approvedAt: platformSub.approved_at,
        }
      : null,
    copyEntitlements: allEnts.map((e) => ({
      id: e.id,
      tier: e.tier,
      status: e.status,
      tradingAccountId: e.trading_account_id,
      currentPeriodEnd: e.current_period_end,
      approvedAt: e.approved_at,
    })),
    paymentHistory: allOrders.map((o) => ({
      id: o.id,
      productCode: o.billing_products?.code ?? "",
      productName: o.billing_products?.name ?? "",
      amount: Number(o.amount),
      currency: o.currency,
      status: o.status,
      checkoutUrl: o.provider_checkout_url,
      createdAt: o.created_at,
      paidAt: o.paid_at,
      botProductId: o.bot_product_id,
      tradingAccountId: o.trading_account_id,
    })),
    botAccess: allBotRecs.map((r) => ({
      id: r.id,
      botProductId: r.product_id,
      botName: r.bot_products?.name ?? "Trading Bot / EA",
      status: r.status,
      grantedAt: r.granted_at,
    })),
    pendingApprovals,
  };
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

export async function approvePaymentAccess(
  orderId: string,
  adminId: string,
): Promise<{ ok: boolean; message: string }> {
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from("payment_orders")
    .select("id, user_id, product_id, status, trading_account_id, tier, bot_product_id")
    .eq("id", orderId)
    .single();

  if (error || !order) return { ok: false, message: "Order not found" };
  if (order.status !== "PAID") return { ok: false, message: "Order is not in PAID status" };

  const { data: product } = await supabase
    .from("billing_products")
    .select("type, code")
    .eq("id", order.product_id)
    .single();

  if (!product) return { ok: false, message: "Product not found" };

  const now = new Date().toISOString();
  const pEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();

  if (product.type === "SUBSCRIPTION") {
    await supabase
      .from("subscriptions")
      .update({
        status: "ACTIVE",
        starts_at: now,
        current_period_end: pEnd,
        approved_by_admin_id: adminId,
        approved_at: now,
      })
      .eq("payment_order_id", orderId)
      .eq("status", "PENDING_APPROVAL");
  } else if (product.type === "COPY_ACCOUNT") {
    await supabase
      .from("copy_account_entitlements")
      .update({
        status: "ACTIVE",
        current_period_end: pEnd,
        approved_by_admin_id: adminId,
        approved_at: now,
      })
      .eq("payment_order_id", orderId)
      .eq("status", "PENDING_APPROVAL");
  } else if (product.type === "BOT" && order.bot_product_id) {
    await supabase
      .from("bot_access_records")
      .update({
        status: "ACTIVE",
        granted_by: adminId,
        granted_at: now,
      })
      .eq("user_id", order.user_id)
      .eq("product_id", order.bot_product_id)
      .eq("source", "FUTURE_PAYMENT");
  }

  await writeAuditLog({
    actorUserId: adminId,
    action: "PAYMENT_ACCESS_APPROVED",
    entityType: "payment_order",
    entityId: orderId,
    metadata: { productType: product.type, userId: order.user_id },
  });

  return { ok: true, message: "Access approved" };
}

/** Expire entitlements whose current_period_end has passed. */
export async function expireStaleEntitlements(): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  await Promise.all([
    supabase
      .from("subscriptions")
      .update({ status: "EXPIRED" })
      .eq("status", "ACTIVE")
      .lt("current_period_end", now),

    supabase
      .from("copy_account_entitlements")
      .update({ status: "EXPIRED" })
      .eq("status", "ACTIVE")
      .lt("current_period_end", now),
  ]);
}

/** Returns whether a user has an active platform subscription. */
export async function hasActivePlatformSubscription(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .gt("current_period_end", new Date().toISOString());
  return (count ?? 0) > 0;
}

/** Returns active copy entitlements for a user, optionally for a specific account. */
export async function getActiveCopyEntitlements(
  userId: string,
  tradingAccountId?: string,
): Promise<CopyEntitlementDto[]> {
  const supabase = createAdminClient();
  let q = supabase
    .from("copy_account_entitlements")
    .select("id, tier, status, trading_account_id, current_period_end, approved_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .gt("current_period_end", new Date().toISOString());

  if (tradingAccountId) q = q.eq("trading_account_id", tradingAccountId);

  const { data } = await q;
  return (data ?? []) as unknown as CopyEntitlementDto[];
}
