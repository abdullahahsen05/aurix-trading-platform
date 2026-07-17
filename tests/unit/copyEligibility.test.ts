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

  test("global and account pause rules identify their scope", () => {
    expect(evaluateFollowerEligibility({ ...base, globalCopyEnabled: false })).toMatchObject({
      eligible: false,
      ruleCode: "GLOBAL_COPY_PAUSED",
      scope: "GLOBAL",
    });
    expect(evaluateFollowerEligibility({ ...base, accountCopyEnabled: false })).toMatchObject({
      eligible: false,
      ruleCode: "ACCOUNT_COPY_PAUSED",
      scope: "ACCOUNT",
    });
  });

  test("uses the strictest global and account position limit", () => {
    expect(evaluateFollowerEligibility({
      ...base,
      openCopiedTrades: 3,
      maxOpenTrades: 8,
      globalMaxOpenTrades: 3,
    })).toMatchObject({ eligible: false, ruleCode: "GLOBAL_MAX_OPEN_POSITIONS" });
  });

  test("blocks lots above account or global limits", () => {
    expect(evaluateFollowerEligibility({ ...base, proposedLot: 1.5, maxLot: 1 })).toMatchObject({
      eligible: false,
      ruleCode: "ACCOUNT_MAX_LOT",
    });
    expect(evaluateFollowerEligibility({ ...base, proposedLot: 1.5, maxLot: 2, globalMaxLot: 1 })).toMatchObject({
      eligible: false,
      ruleCode: "GLOBAL_MAX_LOT",
    });
  });

  test("blocks after the configured consecutive losses", () => {
    expect(evaluateFollowerEligibility({ ...base, consecutiveLosses: 4, stopAfterLosses: 4 })).toMatchObject({
      eligible: false,
      ruleCode: "ACCOUNT_CONSECUTIVE_LOSSES",
    });
  });

  test("blocks excessive or unverifiable slippage", () => {
    expect(evaluateFollowerEligibility({ ...base, slippagePoints: 6, maxSlippagePoints: 5 })).toMatchObject({
      eligible: false,
      ruleCode: "GLOBAL_MAX_SLIPPAGE",
    });
    expect(evaluateFollowerEligibility({
      ...base,
      slippagePoints: null,
      maxSlippagePoints: 5,
      enforceSlippageAvailability: true,
    })).toMatchObject({ eligible: false, ruleCode: "GLOBAL_SLIPPAGE_UNAVAILABLE" });
  });
});
