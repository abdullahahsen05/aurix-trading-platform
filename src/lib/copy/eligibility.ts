import type { FollowerStatus } from "@/lib/copy/types";

// ─────────────────────────────────────────────────────────────────────────────
// Copy Trading — follower eligibility (pure, unit-tested).
// Returns the FIRST failing reason, or { eligible: true } when the follower may
// be copied. Used by both simulation and live execution so the rules are
// identical across modes.
// ─────────────────────────────────────────────────────────────────────────────

export interface EligibilityContext {
  globalEmergencyStop: boolean;
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
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string | null;
}

const eligible: EligibilityResult = { eligible: true, reason: null };
const blocked = (reason: string): EligibilityResult => ({ eligible: false, reason });

export function evaluateFollowerEligibility(ctx: EligibilityContext): EligibilityResult {
  if (ctx.globalEmergencyStop) return blocked("Emergency stop is enabled");
  if (ctx.followerStatus !== "ACTIVE") return blocked(`Follower status is ${ctx.followerStatus}`);
  if (!ctx.consentAccepted) return blocked("Consent not accepted");
  if (ctx.accountStatus !== "CONNECTED") return blocked(`Account status is ${ctx.accountStatus}`);

  const symbol = ctx.symbol?.toUpperCase() ?? "";
  const block = (ctx.symbolBlocklist ?? []).map((s) => s.toUpperCase());
  if (block.includes(symbol)) return blocked(`Symbol ${symbol} is blocked`);

  const allow = (ctx.symbolAllowlist ?? []).map((s) => s.toUpperCase());
  if (allow.length > 0 && !allow.includes(symbol)) return blocked(`Symbol ${symbol} not in allowlist`);

  if (
    typeof ctx.maxOpenTrades === "number" &&
    typeof ctx.openCopiedTrades === "number" &&
    ctx.openCopiedTrades >= ctx.maxOpenTrades
  ) {
    return blocked("Max open copied trades reached");
  }

  if (
    typeof ctx.maxDailyLossPercent === "number" &&
    typeof ctx.currentDailyLossPercent === "number" &&
    ctx.currentDailyLossPercent >= ctx.maxDailyLossPercent
  ) {
    return blocked("Max daily loss reached");
  }

  if (
    typeof ctx.maxDrawdownPercent === "number" &&
    typeof ctx.currentDrawdownPercent === "number" &&
    ctx.currentDrawdownPercent >= ctx.maxDrawdownPercent
  ) {
    return blocked("Max drawdown reached");
  }

  return eligible;
}
