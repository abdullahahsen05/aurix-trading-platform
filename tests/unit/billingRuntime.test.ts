import { describe, expect, test } from "vitest";
import {
  buildMockCheckoutUrl,
  getBillingRuntimeMode,
  getDemoSectionConfig,
  listDemoSections,
} from "@/lib/payments/runtime";

describe("getBillingRuntimeMode", () => {
  test("returns mock when BILLING_PROVIDER=mock", () => {
    expect(getBillingRuntimeMode({ BILLING_PROVIDER: "mock" })).toBe("mock");
  });

  test("returns mock when BILLING_PROVIDER is unset (safe default)", () => {
    expect(getBillingRuntimeMode({})).toBe("mock");
  });

  test("returns mock when BILLING_PROVIDER is an unknown value", () => {
    expect(getBillingRuntimeMode({ BILLING_PROVIDER: "airwallex" })).toBe("mock");
  });

  test("returns stripe when BILLING_PROVIDER=stripe", () => {
    expect(getBillingRuntimeMode({ BILLING_PROVIDER: "stripe" })).toBe("stripe");
  });
});

describe("buildMockCheckoutUrl", () => {
  test("appends mock payment state to the local return url", () => {
    expect(buildMockCheckoutUrl("https://aurix.local/billing/return", "ord_123")).toBe(
      "https://aurix.local/billing/return?orderId=ord_123&mock=1",
    );
  });
});

describe("demo section config", () => {
  test("lists the trader-facing demo sections that prospects can browse", () => {
    expect(listDemoSections().map((section) => section.slug)).toEqual([
      "dashboard",
      "accounts",
      "ai",
      "copy-trading",
      "terminal",
      "marketplace",
      "my-bots",
      "academy",
      "evaluations",
    ]);
  });

  test("returns the dashboard config with a real demo route", () => {
    expect(getDemoSectionConfig("dashboard")).toMatchObject({
      slug: "dashboard",
      href: "/demo/dashboard",
      title: "Trading overview",
    });
  });
});
