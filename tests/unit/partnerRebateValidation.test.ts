import { describe, expect, it } from "vitest";
import { partnerRebateCreateSchema } from "@/lib/validation/schemas";

describe("partner rebate ledger validation", () => {
  it("accepts pending or approved positive rebate entries", () => {
    expect(partnerRebateCreateSchema.safeParse({
      sourceType: "ADMIN_ADJUSTMENT",
      amount: 25,
      currency: "usd",
      status: "APPROVED",
      description: "Demo rebate",
    }).success).toBe(true);
  });

  it("rejects non-positive and paid-on-creation entries", () => {
    expect(partnerRebateCreateSchema.safeParse({
      sourceType: "ADMIN_ADJUSTMENT",
      amount: 0,
      currency: "USD",
      status: "APPROVED",
    }).success).toBe(false);
    expect(partnerRebateCreateSchema.safeParse({
      sourceType: "ADMIN_ADJUSTMENT",
      amount: 20,
      currency: "USD",
      status: "PAID",
    }).success).toBe(false);
  });
});
