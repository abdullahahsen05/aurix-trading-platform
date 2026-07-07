import { describe, expect, test } from "vitest";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace access flow — schema and guard logic (Phase 5.1 / 5.2)
// Pure unit tests — no DB, no HTTP.
// ─────────────────────────────────────────────────────────────────────────────

// Mirror schemas from API routes
const botPlatformEnum = ["MT5", "MT4", "BOTH"] as const;
const botStatusEnum = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

const productSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens");

const createProductSchema = z.object({
  slug: productSlugSchema,
  name: z.string().min(1).max(200),
  shortDescription: z.string().max(500).optional(),
  platform: z.enum(botPlatformEnum).optional(),
  status: z.enum(botStatusEnum).optional(),
  pricingLabel: z.string().max(100).optional(),
});

const issueLicenseSchema = z.object({
  mt5AccountNumber: z.string().min(1).max(50).trim(),
  platform: z.enum(["MT5", "MT4"]).default("MT5"),
});

const accessActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), expiresAt: z.string().datetime().nullable().optional() }),
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("revoke") }),
  z.object({ action: z.literal("reactivate") }),
]);

describe("product slug validation", () => {
  test("accepts valid slug", () => {
    expect(productSlugSchema.safeParse("trend-master-pro-v2").success).toBe(true);
  });

  test("rejects uppercase", () => {
    expect(productSlugSchema.safeParse("Trend-Master").success).toBe(false);
  });

  test("rejects spaces", () => {
    expect(productSlugSchema.safeParse("trend master").success).toBe(false);
  });

  test("rejects special chars", () => {
    expect(productSlugSchema.safeParse("trend_master!").success).toBe(false);
  });

  test("accepts numeric slug", () => {
    expect(productSlugSchema.safeParse("bot-42").success).toBe(true);
  });

  test("rejects empty slug", () => {
    expect(productSlugSchema.safeParse("").success).toBe(false);
  });
});

describe("create product schema", () => {
  test("accepts minimal valid product", () => {
    const r = createProductSchema.safeParse({ slug: "my-bot", name: "My Bot" });
    expect(r.success).toBe(true);
  });

  test("rejects missing name", () => {
    const r = createProductSchema.safeParse({ slug: "my-bot" });
    expect(r.success).toBe(false);
  });

  test("accepts all platform values", () => {
    for (const platform of botPlatformEnum) {
      const r = createProductSchema.safeParse({ slug: "my-bot", name: "My Bot", platform });
      expect(r.success).toBe(true);
    }
  });

  test("rejects invalid platform", () => {
    const r = createProductSchema.safeParse({ slug: "my-bot", name: "My Bot", platform: "MT6" });
    expect(r.success).toBe(false);
  });

  test("rejects name too long", () => {
    const r = createProductSchema.safeParse({ slug: "my-bot", name: "x".repeat(201) });
    expect(r.success).toBe(false);
  });
});

describe("license issue schema", () => {
  test("accepts valid MT5 account number", () => {
    const r = issueLicenseSchema.safeParse({ mt5AccountNumber: "12345678", platform: "MT5" });
    expect(r.success).toBe(true);
  });

  test("defaults platform to MT5", () => {
    const r = issueLicenseSchema.safeParse({ mt5AccountNumber: "12345678" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.platform).toBe("MT5");
  });

  test("trims whitespace from mt5AccountNumber", () => {
    const r = issueLicenseSchema.safeParse({ mt5AccountNumber: "  12345678  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mt5AccountNumber).toBe("12345678");
  });

  test("rejects empty mt5AccountNumber", () => {
    const r = issueLicenseSchema.safeParse({ mt5AccountNumber: "" });
    expect(r.success).toBe(false);
  });

  test("rejects invalid platform", () => {
    const r = issueLicenseSchema.safeParse({ mt5AccountNumber: "123", platform: "BOTH" });
    expect(r.success).toBe(false);
  });
});

describe("access action schema", () => {
  test("accepts grant action with no expiry", () => {
    const r = accessActionSchema.safeParse({ action: "grant" });
    expect(r.success).toBe(true);
  });

  test("accepts grant action with expiry date", () => {
    const r = accessActionSchema.safeParse({
      action: "grant",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  test("accepts suspend action", () => {
    expect(accessActionSchema.safeParse({ action: "suspend" }).success).toBe(true);
  });

  test("accepts revoke action", () => {
    expect(accessActionSchema.safeParse({ action: "revoke" }).success).toBe(true);
  });

  test("accepts reactivate action", () => {
    expect(accessActionSchema.safeParse({ action: "reactivate" }).success).toBe(true);
  });

  test("rejects unknown action", () => {
    expect(accessActionSchema.safeParse({ action: "delete" }).success).toBe(false);
  });

  test("rejects missing action", () => {
    expect(accessActionSchema.safeParse({}).success).toBe(false);
  });
});

describe("partner role guard logic", () => {
  function checkPartnerBlocked(role: string): boolean {
    return role === "PARTNER";
  }

  test("partner is blocked from marketplace", () => {
    expect(checkPartnerBlocked("PARTNER")).toBe(true);
  });

  test("trader is not blocked", () => {
    expect(checkPartnerBlocked("TRADER")).toBe(false);
  });

  test("admin is not blocked", () => {
    expect(checkPartnerBlocked("ADMIN")).toBe(false);
  });
});

describe("product status visibility", () => {
  function canTraderSeeProduct(status: string): boolean {
    return status === "PUBLISHED";
  }

  test("PUBLISHED is visible to traders", () => {
    expect(canTraderSeeProduct("PUBLISHED")).toBe(true);
  });

  test("DRAFT is not visible to traders", () => {
    expect(canTraderSeeProduct("DRAFT")).toBe(false);
  });

  test("ARCHIVED is not visible to traders", () => {
    expect(canTraderSeeProduct("ARCHIVED")).toBe(false);
  });
});

describe("access status transitions", () => {
  const validTransitions: Record<string, string[]> = {
    REQUESTED: ["ACTIVE", "REVOKED"],
    ACTIVE: ["SUSPENDED", "REVOKED"],
    SUSPENDED: ["ACTIVE", "REVOKED"],
    REVOKED: ["ACTIVE"],
    EXPIRED: [],
  };

  function canTransition(from: string, to: string): boolean {
    return validTransitions[from]?.includes(to) ?? false;
  }

  test("REQUESTED can be granted (ACTIVE)", () => {
    expect(canTransition("REQUESTED", "ACTIVE")).toBe(true);
  });

  test("ACTIVE can be suspended", () => {
    expect(canTransition("ACTIVE", "SUSPENDED")).toBe(true);
  });

  test("SUSPENDED can be reactivated", () => {
    expect(canTransition("SUSPENDED", "ACTIVE")).toBe(true);
  });

  test("REVOKED can be reactivated", () => {
    expect(canTransition("REVOKED", "ACTIVE")).toBe(true);
  });

  test("EXPIRED cannot transition", () => {
    expect(canTransition("EXPIRED", "ACTIVE")).toBe(false);
    expect(canTransition("EXPIRED", "REVOKED")).toBe(false);
  });
});
