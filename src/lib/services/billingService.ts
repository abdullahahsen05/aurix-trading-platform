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

export type BillingAccessState =
  | "NONE"
  | "PENDING_PAYMENT"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"
  | "REFUNDED";

export interface BillingAccessSummaryDto {
  status: BillingAccessState;
  orderId: string | null;
  currentPeriodEnd: string | null;
  approvedAt: string | null;
  message: string;
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

export interface BotAccessDto extends BillingAccessSummaryDto {
  id: string;
  botProductId: string;
  botName: string;
  grantedAt: string | null;
}

export interface SubscriptionDto extends BillingAccessSummaryDto {
  id: string;
  productCode: string;
  productName: string;
}

export interface CopyEntitlementDto extends BillingAccessSummaryDto {
  id: string;
  tier: string;
  tradingAccountId: string | null;
}

export interface MentorshipAccessDto extends BillingAccessSummaryDto {
  id: string;
  productCode: string;
  productName: string;
}

export interface UserBillingSummaryDto {
  platformSubscription: SubscriptionDto;
  copyEntitlements: CopyEntitlementDto[];
  paymentHistory: PaymentOrderDto[];
  botAccess: BotAccessDto[];
  mentorshipAccess: MentorshipAccessDto;
  pendingApprovals: Array<{
    type: string;
    orderId: string;
    productName: string;
    paidAt: string;
  }>;
}

// ─── Access check ────────────────────────────────────────────────────────────

export interface ExistingAccessResult {
  status: BillingAccessState;
  message: string;
}

type SubscriptionAccessRow = {
  id: string;
  status: string;
  currentPeriodEnd: string | null;
  approvedAt: string | null;
  createdAt: string;
  productCode: string;
  productName: string;
};

type CopyEntitlementAccessRow = {
  id: string;
  tier: string;
  status: string;
  tradingAccountId: string | null;
  currentPeriodEnd: string | null;
  approvedAt: string | null;
  createdAt: string;
};

type PaymentOrderAccessRow = {
  id: string;
  status: string;
  createdAt: string;
  productCode?: string;
  productName?: string;
  tradingAccountId?: string | null;
  botProductId?: string | null;
  tier?: string | null;
  approvedAt?: string | null;
};

type BotAccessRecordRow = {
  id: string;
  botProductId: string;
  botName: string;
  status: string;
  grantedAt: string | null;
  createdAt: string;
};

function compareDescByCreatedAt<T extends { createdAt: string }>(a: T, b: T) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function isFuture(dateValue: string | null | undefined, nowIso: string) {
  if (!dateValue) return false;
  return new Date(dateValue).getTime() > new Date(nowIso).getTime();
}

function mapTerminalState(status: string | null | undefined): BillingAccessState {
  if (status === "FAILED") return "FAILED";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "REFUNDED") return "REFUNDED";
  return "NONE";
}

function defaultMessage(status: BillingAccessState, itemName: string) {
  switch (status) {
    case "PENDING_PAYMENT":
      return "Payment pending";
    case "PENDING_APPROVAL":
      return "Payment received — pending admin approval";
    case "ACTIVE":
      return `${itemName} active`;
    case "EXPIRED":
      return `${itemName} expired`;
    case "CANCELLED":
      return "Cancelled";
    case "FAILED":
      return "Failed — try again";
    case "REFUNDED":
      return "Refunded";
    default:
      return "";
  }
}

export function canCreateCheckoutForState(status: BillingAccessState, isRenewable: boolean): boolean {
  if (status === "NONE" || status === "FAILED" || status === "CANCELLED" || status === "REFUNDED") {
    return true;
  }
  if (status === "EXPIRED") return isRenewable;
  return false;
}

export function derivePlatformSubscriptionAccess(params: {
  subscriptions: SubscriptionAccessRow[];
  orders: PaymentOrderAccessRow[];
  nowIso: string;
}): SubscriptionDto {
  const subscriptions = [...params.subscriptions].sort(compareDescByCreatedAt);
  const orders = [...params.orders].sort(compareDescByCreatedAt);

  const active = subscriptions.find((sub) => sub.status === "ACTIVE" && isFuture(sub.currentPeriodEnd, params.nowIso));
  if (active) {
    return {
      id: active.id,
      productCode: active.productCode,
      productName: active.productName,
      status: "ACTIVE",
      currentPeriodEnd: active.currentPeriodEnd,
      approvedAt: active.approvedAt,
      orderId: null,
      message: defaultMessage("ACTIVE", active.productName),
    };
  }

  const pendingApprovalSub = subscriptions.find((sub) => sub.status === "PENDING_APPROVAL");
  if (pendingApprovalSub) {
    return {
      id: pendingApprovalSub.id,
      productCode: pendingApprovalSub.productCode,
      productName: pendingApprovalSub.productName,
      status: "PENDING_APPROVAL",
      currentPeriodEnd: pendingApprovalSub.currentPeriodEnd,
      approvedAt: pendingApprovalSub.approvedAt,
      orderId: null,
      message: defaultMessage("PENDING_APPROVAL", pendingApprovalSub.productName),
    };
  }

  const paidOrder = orders.find((order) => order.status === "PAID");
  if (paidOrder) {
    return {
      id: "",
      productCode: paidOrder.productCode ?? "PLATFORM_MONTHLY",
      productName: paidOrder.productName ?? "Platform Subscription",
      status: "PENDING_APPROVAL",
      currentPeriodEnd: null,
      approvedAt: paidOrder.approvedAt ?? null,
      orderId: paidOrder.id,
      message: defaultMessage("PENDING_APPROVAL", "Platform Subscription"),
    };
  }

  const pendingOrder = orders.find((order) => order.status === "PENDING");
  if (pendingOrder) {
    return {
      id: "",
      productCode: pendingOrder.productCode ?? "PLATFORM_MONTHLY",
      productName: pendingOrder.productName ?? "Platform Subscription",
      status: "PENDING_PAYMENT",
      currentPeriodEnd: null,
      approvedAt: null,
      orderId: pendingOrder.id,
      message: defaultMessage("PENDING_PAYMENT", "Platform Subscription"),
    };
  }

  const expired = subscriptions.find((sub) =>
    (sub.status === "ACTIVE" || sub.status === "EXPIRED") && sub.currentPeriodEnd && !isFuture(sub.currentPeriodEnd, params.nowIso),
  );
  if (expired) {
    return {
      id: expired.id,
      productCode: expired.productCode,
      productName: expired.productName,
      status: "EXPIRED",
      currentPeriodEnd: expired.currentPeriodEnd,
      approvedAt: expired.approvedAt,
      orderId: null,
      message: defaultMessage("EXPIRED", expired.productName),
    };
  }

  const terminal = orders.find((order) => mapTerminalState(order.status) !== "NONE");
  const terminalState = mapTerminalState(terminal?.status);
  return {
    id: "",
    productCode: terminal?.productCode ?? "PLATFORM_MONTHLY",
    productName: terminal?.productName ?? "Platform Subscription",
    status: terminalState,
    currentPeriodEnd: null,
    approvedAt: terminal?.approvedAt ?? null,
    orderId: terminal?.id ?? null,
    message: defaultMessage(terminalState, "Platform Subscription"),
  };
}

export function deriveCopyEntitlementAccess(params: {
  tradingAccountId: string;
  entitlements: CopyEntitlementAccessRow[];
  orders: PaymentOrderAccessRow[];
  nowIso: string;
}): CopyEntitlementDto {
  const entitlements = params.entitlements
    .filter((entry) => entry.tradingAccountId === params.tradingAccountId)
    .sort(compareDescByCreatedAt);
  const orders = params.orders
    .filter((order) => order.tradingAccountId === params.tradingAccountId)
    .sort(compareDescByCreatedAt);

  const active = entitlements.find((entry) => entry.status === "ACTIVE" && isFuture(entry.currentPeriodEnd, params.nowIso));
  if (active) {
    return {
      id: active.id,
      tier: active.tier,
      tradingAccountId: active.tradingAccountId,
      status: "ACTIVE",
      currentPeriodEnd: active.currentPeriodEnd,
      approvedAt: active.approvedAt,
      orderId: null,
      message: defaultMessage("ACTIVE", "Copy trading access"),
    };
  }

  const pendingApprovalEntry = entitlements.find((entry) => entry.status === "PENDING_APPROVAL");
  if (pendingApprovalEntry) {
    return {
      id: pendingApprovalEntry.id,
      tier: pendingApprovalEntry.tier,
      tradingAccountId: pendingApprovalEntry.tradingAccountId,
      status: "PENDING_APPROVAL",
      currentPeriodEnd: pendingApprovalEntry.currentPeriodEnd,
      approvedAt: pendingApprovalEntry.approvedAt,
      orderId: null,
      message: defaultMessage("PENDING_APPROVAL", "Copy trading access"),
    };
  }

  const paidOrder = orders.find((order) => order.status === "PAID");
  if (paidOrder) {
    return {
      id: "",
      tier: paidOrder.tier ?? "NORMAL",
      tradingAccountId: params.tradingAccountId,
      status: "PENDING_APPROVAL",
      currentPeriodEnd: null,
      approvedAt: paidOrder.approvedAt ?? null,
      orderId: paidOrder.id,
      message: defaultMessage("PENDING_APPROVAL", "Copy trading access"),
    };
  }

  const pendingOrder = orders.find((order) => order.status === "PENDING");
  if (pendingOrder) {
    return {
      id: "",
      tier: pendingOrder.tier ?? "NORMAL",
      tradingAccountId: params.tradingAccountId,
      status: "PENDING_PAYMENT",
      currentPeriodEnd: null,
      approvedAt: null,
      orderId: pendingOrder.id,
      message: defaultMessage("PENDING_PAYMENT", "Copy trading access"),
    };
  }

  const expired = entitlements.find((entry) =>
    (entry.status === "ACTIVE" || entry.status === "EXPIRED") && entry.currentPeriodEnd && !isFuture(entry.currentPeriodEnd, params.nowIso),
  );
  if (expired) {
    return {
      id: expired.id,
      tier: expired.tier,
      tradingAccountId: expired.tradingAccountId,
      status: "EXPIRED",
      currentPeriodEnd: expired.currentPeriodEnd,
      approvedAt: expired.approvedAt,
      orderId: null,
      message: defaultMessage("EXPIRED", "Copy trading access"),
    };
  }

  const terminal = orders.find((order) => mapTerminalState(order.status) !== "NONE");
  const terminalState = mapTerminalState(terminal?.status);
  return {
    id: "",
    tier: terminal?.tier ?? "NORMAL",
    tradingAccountId: params.tradingAccountId,
    status: terminalState,
    currentPeriodEnd: null,
    approvedAt: terminal?.approvedAt ?? null,
    orderId: terminal?.id ?? null,
    message: defaultMessage(terminalState, "Copy trading access"),
  };
}

export function deriveBotPurchaseAccess(params: {
  botProductId: string;
  botName: string;
  accessRecords: BotAccessRecordRow[];
  orders: PaymentOrderAccessRow[];
}): BotAccessDto {
  const accessRecords = params.accessRecords
    .filter((entry) => entry.botProductId === params.botProductId)
    .sort(compareDescByCreatedAt);
  const orders = params.orders
    .filter((order) => order.botProductId === params.botProductId)
    .sort(compareDescByCreatedAt);

  const active = accessRecords.find((entry) => entry.status === "ACTIVE");
  if (active) {
    return {
      id: active.id,
      botProductId: active.botProductId,
      botName: active.botName,
      status: "ACTIVE",
      currentPeriodEnd: null,
      approvedAt: active.grantedAt,
      grantedAt: active.grantedAt,
      orderId: null,
      message: defaultMessage("ACTIVE", "Bot access"),
    };
  }

  const requested = accessRecords.find((entry) => entry.status === "REQUESTED");
  if (requested) {
    return {
      id: requested.id,
      botProductId: requested.botProductId,
      botName: requested.botName,
      status: "PENDING_APPROVAL",
      currentPeriodEnd: null,
      approvedAt: null,
      grantedAt: requested.grantedAt,
      orderId: null,
      message: defaultMessage("PENDING_APPROVAL", "Bot access"),
    };
  }

  const paidOrder = orders.find((order) => order.status === "PAID");
  if (paidOrder) {
    return {
      id: "",
      botProductId: params.botProductId,
      botName: params.botName,
      status: "PENDING_APPROVAL",
      currentPeriodEnd: null,
      approvedAt: paidOrder.approvedAt ?? null,
      grantedAt: null,
      orderId: paidOrder.id,
      message: defaultMessage("PENDING_APPROVAL", "Bot access"),
    };
  }

  const pendingOrder = orders.find((order) => order.status === "PENDING");
  if (pendingOrder) {
    return {
      id: "",
      botProductId: params.botProductId,
      botName: params.botName,
      status: "PENDING_PAYMENT",
      currentPeriodEnd: null,
      approvedAt: null,
      grantedAt: null,
      orderId: pendingOrder.id,
      message: defaultMessage("PENDING_PAYMENT", "Bot access"),
    };
  }

  const terminal = orders.find((order) => mapTerminalState(order.status) !== "NONE");
  const terminalState = mapTerminalState(terminal?.status);
  return {
    id: "",
    botProductId: params.botProductId,
    botName: params.botName,
    status: terminalState,
    currentPeriodEnd: null,
    approvedAt: terminal?.approvedAt ?? null,
    grantedAt: null,
    orderId: terminal?.id ?? null,
    message: defaultMessage(terminalState, "Bot access"),
  };
}

export function deriveMentorshipAccess(params: {
  orders: PaymentOrderAccessRow[];
}): MentorshipAccessDto {
  const orders = [...params.orders].sort(compareDescByCreatedAt);
  const latest = orders[0];
  if (!latest) {
    return {
      id: "",
      productCode: "MENTORSHIP_1_1",
      productName: "1-to-1 Professional Mentorship",
      status: "NONE",
      currentPeriodEnd: null,
      approvedAt: null,
      orderId: null,
      message: "",
    };
  }

  const status: BillingAccessState =
    latest.approvedAt
      ? "ACTIVE"
      : latest.status === "PAID"
        ? "PENDING_APPROVAL"
        : latest.status === "PENDING"
          ? "PENDING_PAYMENT"
          : mapTerminalState(latest.status);

  return {
    id: latest.id,
    productCode: latest.productCode ?? "MENTORSHIP_1_1",
    productName: latest.productName ?? "1-to-1 Professional Mentorship",
    status,
    currentPeriodEnd: null,
    approvedAt: latest.approvedAt ?? null,
    orderId: latest.id,
    message: defaultMessage(status, "Mentorship access"),
  };
}

export async function getPlatformSubscriptionAccess(userId: string): Promise<SubscriptionDto> {
  const summary = await getTraderAccessSummary(userId);
  return summary.platformSubscription;
}

export async function getCopyEntitlementAccess(
  userId: string,
  tradingAccountId: string,
): Promise<CopyEntitlementDto> {
  const summary = await getTraderAccessSummary(userId);
  return (
    summary.copyEntitlements.find((entry) => entry.tradingAccountId === tradingAccountId) ?? {
      id: "",
      tier: "NORMAL",
      tradingAccountId,
      status: "NONE",
      currentPeriodEnd: null,
      approvedAt: null,
      orderId: null,
      message: "",
    }
  );
}

export async function getBotPurchaseAccess(userId: string, botProductId: string): Promise<BotAccessDto> {
  const summary = await getTraderAccessSummary(userId);
  return (
    summary.botAccess.find((entry) => entry.botProductId === botProductId) ?? {
      id: "",
      botProductId,
      botName: "Trading Bot / EA",
      status: "NONE",
      currentPeriodEnd: null,
      approvedAt: null,
      grantedAt: null,
      orderId: null,
      message: "",
    }
  );
}

export async function getMentorshipAccess(userId: string): Promise<MentorshipAccessDto> {
  const summary = await getTraderAccessSummary(userId);
  return summary.mentorshipAccess;
}

/** Returns NONE if the user may purchase; otherwise returns the blocking status. */
export async function checkExistingAccess(
  userId: string,
  productCode: string,
  options?: { tradingAccountId?: string; botProductId?: string },
): Promise<ExistingAccessResult> {
  const product = await getProductByCode(productCode);
  if (!product) return { status: "NONE", message: "" };

  if (product.type === "SUBSCRIPTION") {
    const access = await getPlatformSubscriptionAccess(userId);
    return { status: access.status, message: access.message };
  }

  if (product.type === "COPY_ACCOUNT") {
    if (!options?.tradingAccountId) {
      return { status: "NONE", message: "Trading account is required" };
    }
    const access = await getCopyEntitlementAccess(userId, options.tradingAccountId);
    return { status: access.status, message: access.message };
  }

  if (product.type === "BOT") {
    if (options?.botProductId) {
      const access = await getBotPurchaseAccess(userId, options.botProductId);
      return { status: access.status, message: access.message };
    }
    return { status: "NONE", message: "" };
  }

  if (product.type === "EVALUATION") {
    return { status: "NONE", message: "" };
  }

  const access = await getMentorshipAccess(userId);
  return { status: access.status, message: access.message };
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
  if (product.type === "COPY_ACCOUNT" && !params.tradingAccountId) {
    throw new Error("Trading account is required for copy trading access");
  }
  if (product.type === "BOT" && !params.botProductId) {
    throw new Error("Bot product is required for this purchase");
  }

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

export async function getTraderAccessSummary(userId: string): Promise<UserBillingSummaryDto> {
  const supabase = createAdminClient();

  const [{ data: subs }, { data: entitlements }, { data: orders }, { data: botRecs }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, status, current_period_end, approved_at, created_at, billing_products(code, name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),

    supabase
      .from("copy_account_entitlements")
      .select("id, tier, status, trading_account_id, current_period_end, approved_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("payment_orders")
      .select("id, status, amount, currency, paid_at, created_at, provider_checkout_url, trading_account_id, bot_product_id, tier, metadata, billing_products(code, name, type, billing_interval)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("bot_access_records")
      .select("id, product_id, status, granted_at, created_at, bot_products(name)")
      .eq("user_id", userId)
      .limit(20),
  ]);

  type SubRow = {
    id: string;
    status: string;
    current_period_end: string | null;
    approved_at: string | null;
    created_at: string;
    billing_products: { code: string; name: string } | null;
  };

  type EntRow = {
    id: string;
    tier: string;
    status: string;
    trading_account_id: string | null;
    current_period_end: string | null;
    approved_at: string | null;
    created_at: string;
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
    tier: string | null;
    metadata: { approvedAt?: string | null } | null;
    billing_products: { code: string; name: string; type: string; billing_interval: string } | null;
  };

  type BotRecRow = {
    id: string;
    product_id: string;
    status: string;
    granted_at: string | null;
    created_at: string;
    bot_products: { name: string } | null;
  };

  const allSubs = (subs ?? []) as unknown as SubRow[];
  const allEnts = (entitlements ?? []) as unknown as EntRow[];
  const allOrders = (orders ?? []) as unknown as OrderRow[];
  const allBotRecs = (botRecs ?? []) as unknown as BotRecRow[];

  const normalizedOrders = allOrders.map((o) => ({
    id: o.id,
    status: o.status,
    createdAt: o.created_at,
    productCode: o.billing_products?.code,
    productName: o.billing_products?.name,
    tradingAccountId: o.trading_account_id,
    botProductId: o.bot_product_id,
    tier: o.tier,
    approvedAt: o.metadata?.approvedAt ?? null,
  }));

  const platformOrders = normalizedOrders.filter((o) => o.productCode === "PLATFORM_MONTHLY");
  const platformSubscription = derivePlatformSubscriptionAccess({
    subscriptions: allSubs
      .filter((s) => s.billing_products?.code === "PLATFORM_MONTHLY")
      .map((s) => ({
        id: s.id,
        status: s.status,
        currentPeriodEnd: s.current_period_end,
        approvedAt: s.approved_at,
        createdAt: s.created_at,
        productCode: s.billing_products?.code ?? "PLATFORM_MONTHLY",
        productName: s.billing_products?.name ?? "Platform Subscription",
      })),
    orders: platformOrders,
    nowIso: new Date().toISOString(),
  });

  const copyAccountIds = Array.from(
    new Set(
      [
        ...allEnts.map((e) => e.trading_account_id).filter((value): value is string => Boolean(value)),
        ...normalizedOrders
          .filter((o) => o.productCode === "COPY_NORMAL" || o.productCode === "COPY_ULTRA_FAST")
          .map((o) => o.tradingAccountId)
          .filter((value): value is string => Boolean(value)),
      ],
    ),
  );

  const copyEntitlements = copyAccountIds.map((tradingAccountId) =>
    deriveCopyEntitlementAccess({
      tradingAccountId,
      entitlements: allEnts.map((e) => ({
        id: e.id,
        tier: e.tier,
        status: e.status,
        tradingAccountId: e.trading_account_id,
        currentPeriodEnd: e.current_period_end,
        approvedAt: e.approved_at,
        createdAt: e.created_at,
      })),
      orders: normalizedOrders.filter(
        (o) => (o.productCode === "COPY_NORMAL" || o.productCode === "COPY_ULTRA_FAST") && o.tradingAccountId === tradingAccountId,
      ),
      nowIso: new Date().toISOString(),
    }),
  );

  const botIds = Array.from(
    new Set(
      [
        ...allBotRecs.map((r) => r.product_id),
        ...normalizedOrders.map((o) => o.botProductId).filter((value): value is string => Boolean(value)),
      ],
    ),
  );

  const botAccess = botIds.map((botProductId) =>
    deriveBotPurchaseAccess({
      botProductId,
      botName:
        allBotRecs.find((r) => r.product_id === botProductId)?.bot_products?.name ??
        "Trading Bot / EA",
      accessRecords: allBotRecs.map((r) => ({
        id: r.id,
        botProductId: r.product_id,
        botName: r.bot_products?.name ?? "Trading Bot / EA",
        status: r.status,
        grantedAt: r.granted_at,
        createdAt: r.created_at,
      })),
      orders: normalizedOrders.filter((o) => o.botProductId === botProductId),
    }),
  );

  const mentorshipAccess = deriveMentorshipAccess({
    orders: normalizedOrders.filter((o) => o.productCode === "MENTORSHIP_1_1"),
  });

  const pendingApprovals = [
    ...platformOrders
      .filter((o) => o.status === "PAID")
      .map((o) => ({
        type: "SUBSCRIPTION",
        orderId: o.id,
        productName: o.productName ?? "Platform Subscription",
        paidAt: allOrders.find((row) => row.id === o.id)?.paid_at ?? "",
      })),
    ...normalizedOrders
      .filter((o) => (o.productCode === "COPY_NORMAL" || o.productCode === "COPY_ULTRA_FAST") && o.status === "PAID")
      .map((o) => ({
        type: "COPY_ENTITLEMENT",
        orderId: o.id,
        productName: o.productName ?? `Copy Trading (${o.tier ?? "NORMAL"})`,
        paidAt: allOrders.find((row) => row.id === o.id)?.paid_at ?? "",
      })),
    ...normalizedOrders
      .filter((o) => o.productCode === "BOT_EA" && o.status === "PAID")
      .map((o) => ({
        type: "BOT",
        orderId: o.id,
        productName: o.productName ?? "Trading Bot / EA",
        paidAt: allOrders.find((row) => row.id === o.id)?.paid_at ?? "",
      })),
    ...normalizedOrders
      .filter((o) => o.productCode === "MENTORSHIP_1_1" && o.status === "PAID" && !o.approvedAt)
      .map((o) => ({
        type: "MENTORSHIP",
        orderId: o.id,
        productName: o.productName ?? "1-to-1 Professional Mentorship",
        paidAt: allOrders.find((row) => row.id === o.id)?.paid_at ?? "",
      })),
  ];

  return {
    platformSubscription,
    copyEntitlements,
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
    botAccess,
    mentorshipAccess,
    pendingApprovals,
  };
}

export async function getUserBillingSummary(userId: string): Promise<UserBillingSummaryDto> {
  return getTraderAccessSummary(userId);
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

export async function approvePaymentAccess(
  orderId: string,
  adminId: string,
): Promise<{ ok: boolean; message: string }> {
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from("payment_orders")
    .select("id, user_id, product_id, status, trading_account_id, tier, bot_product_id, metadata")
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
  } else if (product.type === "MENTORSHIP") {
    await supabase
      .from("payment_orders")
      .update({
        metadata: {
          ...((order.metadata as Record<string, unknown> | null) ?? {}),
          approvedAt: now,
          approvedByAdminId: adminId,
        },
      })
      .eq("id", orderId);
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
