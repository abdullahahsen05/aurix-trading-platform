import { describe, expect, test } from "vitest";
import { evaluateFollowerEligibility, type EligibilityContext } from "@/lib/copy/eligibility";

const base: EligibilityContext = {
  globalEmergencyStop: false,
  followerStatus: "ACTIVE",
  consentAccepted: true,
  accountStatus: "CONNECTED",
  symbol: "EURUSD",
};

describe("evaluateFollowerEligibility", () => {
  test("eligible when everything passes", () => {
    expect(evaluateFollowerEligibility(base).eligible).toBe(true);
  });

  test("emergency stop blocks", () => {
    expect(evaluateFollowerEligibility({ ...base, globalEmergencyStop: true }).eligible).toBe(false);
  });

  test("non-active follower blocked", () => {
    expect(evaluateFollowerEligibility({ ...base, followerStatus: "PAUSED" }).eligible).toBe(false);
  });

  test("missing consent blocked", () => {
    expect(evaluateFollowerEligibility({ ...base, consentAccepted: false }).eligible).toBe(false);
  });

  test("disconnected / restricted account blocked", () => {
    expect(evaluateFollowerEligibility({ ...base, accountStatus: "DISCONNECTED" }).eligible).toBe(false);
    expect(evaluateFollowerEligibility({ ...base, accountStatus: "RESTRICTED" }).eligible).toBe(false);
  });

  test("blocklisted symbol blocked", () => {
    expect(evaluateFollowerEligibility({ ...base, symbolBlocklist: ["EURUSD"] }).eligible).toBe(false);
  });

  test("symbol not in allowlist blocked", () => {
    expect(evaluateFollowerEligibility({ ...base, symbolAllowlist: ["GBPUSD"] }).eligible).toBe(false);
    expect(evaluateFollowerEligibility({ ...base, symbolAllowlist: ["EURUSD"] }).eligible).toBe(true);
  });

  test("max open trades reached blocked", () => {
    expect(
      evaluateFollowerEligibility({ ...base, openCopiedTrades: 5, maxOpenTrades: 5 }).eligible,
    ).toBe(false);
  });

  test("max daily loss / drawdown reached blocked", () => {
    expect(
      evaluateFollowerEligibility({ ...base, currentDailyLossPercent: 6, maxDailyLossPercent: 5 }).eligible,
    ).toBe(false);
    expect(
      evaluateFollowerEligibility({ ...base, currentDrawdownPercent: 11, maxDrawdownPercent: 10 }).eligible,
    ).toBe(false);
  });
});
