import { describe, expect, test } from "vitest";
import {
  canCreateCheckoutForState,
  deriveBotPurchaseAccess,
  deriveCopyEntitlementAccess,
  deriveMentorshipAccess,
  derivePlatformSubscriptionAccess,
  type BillingAccessState,
} from "@/lib/services/billingService";

describe("derivePlatformSubscriptionAccess", () => {
  test("returns ACTIVE when an approved subscription is still in period", () => {
    const result = derivePlatformSubscriptionAccess({
      subscriptions: [
        {
          id: "sub_1",
          status: "ACTIVE",
          currentPeriodEnd: "2026-08-10T00:00:00.000Z",
          approvedAt: "2026-07-10T00:00:00.000Z",
          createdAt: "2026-07-10T00:00:00.000Z",
          productCode: "PLATFORM_MONTHLY",
          productName: "Platform Subscription",
        },
      ],
      orders: [],
      nowIso: "2026-07-20T00:00:00.000Z",
    });

    expect(result.status).toBe("ACTIVE");
    expect(result.currentPeriodEnd).toBe("2026-08-10T00:00:00.000Z");
  });

  test("returns PENDING_PAYMENT when there is a pending platform checkout and no active subscription", () => {
    const result = derivePlatformSubscriptionAccess({
      subscriptions: [],
      orders: [
        {
          id: "ord_1",
          status: "PENDING",
          createdAt: "2026-07-20T00:00:00.000Z",
        },
      ],
      nowIso: "2026-07-20T00:00:00.000Z",
    });

    expect(result.status).toBe("PENDING_PAYMENT");
    expect(result.orderId).toBe("ord_1");
  });

  test("returns EXPIRED when the latest active subscription period has ended", () => {
    const result = derivePlatformSubscriptionAccess({
      subscriptions: [
        {
          id: "sub_2",
          status: "ACTIVE",
          currentPeriodEnd: "2026-06-10T00:00:00.000Z",
          approvedAt: "2026-05-10T00:00:00.000Z",
          createdAt: "2026-05-10T00:00:00.000Z",
          productCode: "PLATFORM_MONTHLY",
          productName: "Platform Subscription",
        },
      ],
      orders: [],
      nowIso: "2026-07-20T00:00:00.000Z",
    });

    expect(result.status).toBe("EXPIRED");
  });
});

describe("deriveCopyEntitlementAccess", () => {
  test("returns ACTIVE for the requested trading account only", () => {
    const result = deriveCopyEntitlementAccess({
      tradingAccountId: "acct_1",
      entitlements: [
        {
          id: "ent_1",
          tier: "PREMIUM",
          status: "ACTIVE",
          tradingAccountId: "acct_1",
          currentPeriodEnd: "2026-08-20T00:00:00.000Z",
          approvedAt: "2026-07-20T00:00:00.000Z",
          createdAt: "2026-07-20T00:00:00.000Z",
        },
      ],
      orders: [],
      nowIso: "2026-07-21T00:00:00.000Z",
    });

    expect(result.status).toBe("ACTIVE");
    expect(result.tier).toBe("PREMIUM");
  });

  test("returns PENDING_APPROVAL when payment is complete for the account but access is not yet approved", () => {
    const result = deriveCopyEntitlementAccess({
      tradingAccountId: "acct_1",
      entitlements: [],
      orders: [
        {
          id: "ord_copy_paid",
          status: "PAID",
          createdAt: "2026-07-21T00:00:00.000Z",
          tradingAccountId: "acct_1",
          tier: "NORMAL",
        },
      ],
      nowIso: "2026-07-21T00:00:00.000Z",
    });

    expect(result.status).toBe("PENDING_APPROVAL");
    expect(result.tier).toBe("NORMAL");
  });

  test("returns EXPIRED when the account entitlement period has ended", () => {
    const result = deriveCopyEntitlementAccess({
      tradingAccountId: "acct_1",
      entitlements: [
        {
          id: "ent_exp",
          tier: "NORMAL",
          status: "ACTIVE",
          tradingAccountId: "acct_1",
          currentPeriodEnd: "2026-07-01T00:00:00.000Z",
          approvedAt: "2026-06-01T00:00:00.000Z",
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      orders: [],
      nowIso: "2026-07-21T00:00:00.000Z",
    });

    expect(result.status).toBe("EXPIRED");
  });
});

describe("deriveBotPurchaseAccess", () => {
  test("returns ACTIVE when bot access was granted", () => {
    const result = deriveBotPurchaseAccess({
      botProductId: "bot_1",
      botName: "Alpha Bot",
      accessRecords: [
        {
          id: "bar_1",
          botProductId: "bot_1",
          botName: "Alpha Bot",
          status: "ACTIVE",
          grantedAt: "2026-07-21T00:00:00.000Z",
          createdAt: "2026-07-20T00:00:00.000Z",
        },
      ],
      orders: [],
    });

    expect(result.status).toBe("ACTIVE");
    expect(result.botName).toBe("Alpha Bot");
  });

  test("returns PENDING_PAYMENT when checkout exists but payment is not complete", () => {
    const result = deriveBotPurchaseAccess({
      botProductId: "bot_1",
      botName: "Alpha Bot",
      accessRecords: [],
      orders: [
        {
          id: "ord_bot_1",
          status: "PENDING",
          createdAt: "2026-07-21T00:00:00.000Z",
          botProductId: "bot_1",
        },
      ],
    });

    expect(result.status).toBe("PENDING_PAYMENT");
  });
});

describe("deriveMentorshipAccess", () => {
  test("returns PENDING_APPROVAL after payment succeeds but before manual approval", () => {
    const result = deriveMentorshipAccess({
      orders: [
        {
          id: "ord_m1",
          status: "PAID",
          createdAt: "2026-07-21T00:00:00.000Z",
          approvedAt: null,
        },
      ],
    });

    expect(result?.status).toBe("PENDING_APPROVAL");
  });

  test("returns ACTIVE when mentorship purchase was manually approved", () => {
    const result = deriveMentorshipAccess({
      orders: [
        {
          id: "ord_m2",
          status: "PAID",
          createdAt: "2026-07-21T00:00:00.000Z",
          approvedAt: "2026-07-22T00:00:00.000Z",
        },
      ],
    });

    expect(result?.status).toBe("ACTIVE");
  });
});

describe("canCreateCheckoutForState", () => {
  test.each<BillingAccessState>([
    "ACTIVE",
    "PENDING_PAYMENT",
    "PENDING_APPROVAL",
  ])("blocks duplicate checkout when state is %s", (state) => {
    expect(canCreateCheckoutForState(state, false)).toBe(false);
  });

  test.each<BillingAccessState>([
    "FAILED",
    "CANCELLED",
    "REFUNDED",
  ])("allows retry checkout when state is %s", (state) => {
    expect(canCreateCheckoutForState(state, false)).toBe(true);
  });

  test("allows renew only for EXPIRED renewable products", () => {
    expect(canCreateCheckoutForState("EXPIRED", true)).toBe(true);
    expect(canCreateCheckoutForState("EXPIRED", false)).toBe(false);
  });
});
