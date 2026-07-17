import type { FollowerStatus } from "@/lib/copy/types";

// ─────────────────────────────────────────────────────────────────────────────
// Copy Trading — follower eligibility (pure, unit-tested).
// Returns the FIRST failing reason, or { eligible: true } when the follower may
// be copied. Used by both simulation and live execution so the rules are
// identical across modes.
// ─────────────────────────────────────────────────────────────────────────────

export interface EligibilityContext {
  globalEmergencyStop: boolean;
  globalCopyEnabled?: boolean;
  accountCopyEnabled?: boolean;
  pauseOnDisconnect?: boolean;
  followerStatus: FollowerStatus;
  consentAccepted: boolean;
  accountStatus: string; // PENDING | CONNECTED | SYNCING | DISCONNECTED | RESTRICTED
  symbol: string;
  symbolAllowlist?: string[] | null;
  symbolBlocklist?: string[] | null;
  openCopiedTrades?: number | null;
  maxOpenTrades?: number | null;
  currentDailyLossPercent?: number | null;
  maxDailyLossPercent?: number | null;
  currentDrawdownPercent?: number | null;
  maxDrawdownPercent?: number | null;
  globalMaxDailyLossPercent?: number | null;
  globalMaxDrawdownPercent?: number | null;
  globalMaxOpenTrades?: number | null;
  proposedLot?: number | null;
  maxLot?: number | null;
  globalMaxLot?: number | null;
  consecutiveLosses?: number | null;
  stopAfterLosses?: number | null;
  slippagePoints?: number | null;
  maxSlippagePoints?: number | null;
  enforceSlippageAvailability?: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string | null;
  ruleCode: string | null;
  scope: "GLOBAL" | "ACCOUNT" | null;
}

const eligible: EligibilityResult = { eligible: true, reason: null, ruleCode: null, scope: null };
const blocked = (
  reason: string,
  ruleCode: string,
  scope: "GLOBAL" | "ACCOUNT" = "ACCOUNT",
): EligibilityResult => ({ eligible: false, reason, ruleCode, scope });

function lowestLimit(...values: Array<number | null | undefined>): number | null {
  const limits = values.filter((value): value is number => typeof value === "number");
  return limits.length > 0 ? Math.min(...limits) : null;
}

export function evaluateFollowerEligibility(ctx: EligibilityContext): EligibilityResult {
  if (ctx.globalEmergencyStop) return blocked("Emergency stop is enabled", "EMERGENCY_STOP", "GLOBAL");
  if (ctx.globalCopyEnabled === false) return blocked("Global copy is paused", "GLOBAL_COPY_PAUSED", "GLOBAL");
  if (ctx.accountCopyEnabled === false) return blocked("Copying is paused for this account", "ACCOUNT_COPY_PAUSED");
  if (ctx.followerStatus !== "ACTIVE") return blocked(`Follower status is ${ctx.followerStatus}`, "FOLLOWER_INACTIVE");
  if (!ctx.consentAccepted) return blocked("Consent not accepted", "CONSENT_REQUIRED");
  if (ctx.accountStatus !== "CONNECTED") {
    return blocked(
      `Account status is ${ctx.accountStatus}`,
      ctx.pauseOnDisconnect === false ? "ACCOUNT_NOT_CONNECTED" : "PAUSE_ON_DISCONNECT",
      ctx.pauseOnDisconnect === false ? "ACCOUNT" : "GLOBAL",
    );
  }

  const symbol = ctx.symbol?.toUpperCase() ?? "";
  const block = (ctx.symbolBlocklist ?? []).map((s) => s.toUpperCase());
  if (block.includes(symbol)) return blocked(`Symbol ${symbol} is blocked`, "SYMBOL_BLOCKED");

  const allow = (ctx.symbolAllowlist ?? []).map((s) => s.toUpperCase());
  if (allow.length > 0 && !allow.includes(symbol)) return blocked(`Symbol ${symbol} not in allowlist`, "SYMBOL_NOT_ALLOWED");

  const maxOpenTrades = lowestLimit(ctx.maxOpenTrades, ctx.globalMaxOpenTrades);

  if (
    typeof maxOpenTrades === "number" &&
    typeof ctx.openCopiedTrades === "number" &&
    ctx.openCopiedTrades >= maxOpenTrades
  ) {
    return blocked(
      "Max open copied trades reached",
      ctx.globalMaxOpenTrades === maxOpenTrades ? "GLOBAL_MAX_OPEN_POSITIONS" : "ACCOUNT_MAX_OPEN_POSITIONS",
      ctx.globalMaxOpenTrades === maxOpenTrades ? "GLOBAL" : "ACCOUNT",
    );
  }

  const maxDailyLoss = lowestLimit(ctx.maxDailyLossPercent, ctx.globalMaxDailyLossPercent);

  if (
    typeof maxDailyLoss === "number" &&
    typeof ctx.currentDailyLossPercent === "number" &&
    ctx.currentDailyLossPercent >= maxDailyLoss
  ) {
    return blocked(
      "Max daily loss reached",
      ctx.globalMaxDailyLossPercent === maxDailyLoss ? "GLOBAL_MAX_DAILY_LOSS" : "ACCOUNT_MAX_DAILY_LOSS",
      ctx.globalMaxDailyLossPercent === maxDailyLoss ? "GLOBAL" : "ACCOUNT",
    );
  }

  const maxDrawdown = lowestLimit(ctx.maxDrawdownPercent, ctx.globalMaxDrawdownPercent);

  if (
    typeof maxDrawdown === "number" &&
    typeof ctx.currentDrawdownPercent === "number" &&
    ctx.currentDrawdownPercent >= maxDrawdown
  ) {
    return blocked(
      "Max drawdown reached",
      ctx.globalMaxDrawdownPercent === maxDrawdown ? "GLOBAL_MAX_DRAWDOWN" : "ACCOUNT_MAX_DRAWDOWN",
      ctx.globalMaxDrawdownPercent === maxDrawdown ? "GLOBAL" : "ACCOUNT",
    );
  }

  const maxLot = lowestLimit(ctx.maxLot, ctx.globalMaxLot);
  if (typeof maxLot === "number" && typeof ctx.proposedLot === "number" && ctx.proposedLot > maxLot) {
    return blocked(
      `Calculated lot ${ctx.proposedLot} exceeds limit ${maxLot}`,
      ctx.globalMaxLot === maxLot ? "GLOBAL_MAX_LOT" : "ACCOUNT_MAX_LOT",
      ctx.globalMaxLot === maxLot ? "GLOBAL" : "ACCOUNT",
    );
  }

  if (
    typeof ctx.stopAfterLosses === "number" &&
    typeof ctx.consecutiveLosses === "number" &&
    ctx.consecutiveLosses >= ctx.stopAfterLosses
  ) {
    return blocked("Consecutive-loss stop reached", "ACCOUNT_CONSECUTIVE_LOSSES");
  }

  if (typeof ctx.maxSlippagePoints === "number") {
    if (ctx.enforceSlippageAvailability && typeof ctx.slippagePoints !== "number") {
      return blocked("Slippage limit cannot be guaranteed by the broker adapter", "GLOBAL_SLIPPAGE_UNAVAILABLE", "GLOBAL");
    }
    if (typeof ctx.slippagePoints === "number" && ctx.slippagePoints > ctx.maxSlippagePoints) {
      return blocked("Max slippage exceeded", "GLOBAL_MAX_SLIPPAGE", "GLOBAL");
    }
  }

  return eligible;
}
