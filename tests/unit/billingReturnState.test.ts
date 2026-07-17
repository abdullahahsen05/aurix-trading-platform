import { describe, expect, test } from "vitest";
import {
  canReconcileStripeCheckoutReturn,
  deriveBillingReturnState,
  type PaymentOrderDto,
  type UserBillingSummaryDto,
} from "@/lib/services/billingService";

const order: PaymentOrderDto = {
  id: "order-1", productCode: "BOT_EA", productName: "Aurix EA", amount: 500,
  currency: "USD", status: "PAID", checkoutUrl: null, createdAt: "2026-07-16T00:00:00Z",
  paidAt: "2026-07-16T00:01:00Z", botProductId: "bot-1", tradingAccountId: null,
};

const summary: UserBillingSummaryDto = {
  platformSubscription: { id: "", productCode: "", productName: "", status: "NONE", orderId: null, currentPeriodEnd: null, approvedAt: null, message: "" },
  copyEntitlements: [], paymentHistory: [order], botAccess: [],
  mentorshipAccess: { id: "", productCode: "", productName: "", status: "NONE", orderId: null, currentPeriodEnd: null, approvedAt: null, message: "" },
  pendingApprovals: [],
};

describe("billing return state", () => {
  test("paid Bot/EA remains processing until automatic activation is visible", () => {
    expect(deriveBillingReturnState(order, summary).state).toBe("PROCESSING");
  });

  test("active bot access changes the return state to active", () => {
    const withAccess: UserBillingSummaryDto = {
      ...summary,
      botAccess: [{ id: "access-1", botProductId: "bot-1", botName: "Aurix EA", grantedAt: "2026-07-16T00:02:00Z", status: "ACTIVE", orderId: "order-1", currentPeriodEnd: null, approvedAt: "2026-07-16T00:02:00Z", message: "Active" }],
    };
    expect(deriveBillingReturnState(order, withAccess).state).toBe("ACTIVE");
  });

  test("verified platform payment reports active when the subscription is active", () => {
    const platformOrder = {
      ...order,
      productCode: "PLATFORM_MONTHLY",
      productName: "WSA Global Trading Platform Subscription",
      botProductId: null,
    };
    const activePlatform = {
      ...summary,
      paymentHistory: [platformOrder],
      platformSubscription: {
        id: "sub-1",
        productCode: "PLATFORM_MONTHLY",
        productName: platformOrder.productName,
        status: "ACTIVE" as const,
        orderId: platformOrder.id,
        currentPeriodEnd: "2026-08-16T00:00:00Z",
        approvedAt: "2026-07-16T00:01:00Z",
        message: "Active",
      },
    };
    expect(deriveBillingReturnState(platformOrder, activePlatform).state).toBe("ACTIVE");
  });

  test("reconciles only the exact completed and paid Stripe return session", () => {
    const session = {
      id: "cs_test_exact",
      status: "complete",
      payment_status: "paid",
      client_reference_id: "order-1",
    };

    expect(canReconcileStripeCheckoutReturn("order-1", "cs_test_exact", session)).toBe(true);
    expect(canReconcileStripeCheckoutReturn("another-order", "cs_test_exact", session)).toBe(false);
    expect(canReconcileStripeCheckoutReturn("order-1", "cs_test_other", session)).toBe(false);
    expect(canReconcileStripeCheckoutReturn("order-1", "cs_test_exact", { ...session, payment_status: "unpaid" })).toBe(false);
  });
});
