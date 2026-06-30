import { describe, expect, test } from "vitest";
import {
  assignPartnerSchema,
  commissionCreateSchema,
  commissionStatusSchema,
  partnerNoteCreateSchema,
  setUserRoleSchema,
} from "@/lib/validation/schemas";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("assignPartnerSchema", () => {
  test("accepts a uuid or null", () => {
    expect(assignPartnerSchema.safeParse({ partnerId: UUID }).success).toBe(true);
    expect(assignPartnerSchema.safeParse({ partnerId: null }).success).toBe(true);
  });
  test("rejects a non-uuid", () => {
    expect(assignPartnerSchema.safeParse({ partnerId: "nope" }).success).toBe(false);
  });
});

describe("setUserRoleSchema", () => {
  test("accepts valid roles", () => {
    for (const role of ["TRADER", "ADMIN", "PARTNER"]) {
      expect(setUserRoleSchema.safeParse({ role }).success).toBe(true);
    }
  });
  test("rejects unknown roles", () => {
    expect(setUserRoleSchema.safeParse({ role: "SUPERUSER" }).success).toBe(false);
  });
});

describe("commissionStatusSchema", () => {
  test("accepts ledger statuses", () => {
    for (const status of ["PENDING", "APPROVED", "PAID", "CANCELLED"]) {
      expect(commissionStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });
  test("rejects invalid status", () => {
    expect(commissionStatusSchema.safeParse({ status: "REFUNDED" }).success).toBe(false);
  });
});

describe("commissionCreateSchema", () => {
  test("requires commissionAmount and bounds percent 0–100", () => {
    expect(commissionCreateSchema.safeParse({ commissionAmount: 100 }).success).toBe(true);
    expect(
      commissionCreateSchema.safeParse({ commissionAmount: 100, commissionPercent: 150 }).success,
    ).toBe(false);
    expect(commissionCreateSchema.safeParse({}).success).toBe(false);
  });
});

describe("partnerNoteCreateSchema", () => {
  test("requires a uuid trader and non-empty note", () => {
    expect(partnerNoteCreateSchema.safeParse({ traderId: UUID, note: "hi" }).success).toBe(true);
    expect(partnerNoteCreateSchema.safeParse({ traderId: UUID, note: "" }).success).toBe(false);
    expect(partnerNoteCreateSchema.safeParse({ traderId: "x", note: "hi" }).success).toBe(false);
  });
});
