import { describe, expect, test } from "vitest";
import {
  calculateWithdrawalBalance,
  MINIMUM_PARTNER_WITHDRAWAL,
  validateWithdrawalTransition,
} from "@/lib/partner/withdrawals";

describe("partner withdrawal rules", () => {
  test("subtracts reserved and paid allocations from approved commission balance", () => {
    expect(calculateWithdrawalBalance([125, 75.5], [50, 20.25])).toEqual({
      approved: 200.5,
      approvedCommissions: 200.5,
      approvedRebates: 0,
      reserved: 70.25,
      available: 130.25,
      currency: "USD",
      minimum: MINIMUM_PARTNER_WITHDRAWAL,
    });
  });

  test("includes approved rebates but still subtracts locked allocations", () => {
    expect(calculateWithdrawalBalance([150, 40], [25], "USD", 150, 40)).toEqual({
      approved: 190,
      approvedCommissions: 150,
      approvedRebates: 40,
      reserved: 25,
      available: 165,
      currency: "USD",
      minimum: MINIMUM_PARTNER_WITHDRAWAL,
    });
  });

  test("never exposes a negative available balance", () => {
    expect(calculateWithdrawalBalance([50], [75]).available).toBe(0);
  });

  test("allows only the documented review lifecycle", () => {
    expect(validateWithdrawalTransition("PENDING_REVIEW", "APPROVED")).toBe(true);
    expect(validateWithdrawalTransition("PENDING_REVIEW", "REJECTED")).toBe(true);
    expect(validateWithdrawalTransition("APPROVED", "PAID")).toBe(true);
    expect(validateWithdrawalTransition("PAID", "APPROVED")).toBe(false);
    expect(validateWithdrawalTransition("REJECTED", "PAID")).toBe(false);
  });
});
