import type { TradeDto } from "./types";
import {
  calculateAverageWinLossRatio,
  calculateTotalProfit,
  calculateWinRate,
} from "./metrics";

export type Period = "DAILY" | "WEEKLY" | "MONTHLY";

export type PeriodStats = {
  totalProfit: number;
  winRate: number;
  tradeCount: number;
  riskReward: number;
};

export type DashboardView = "CURRENT_EQUITY" | "CHECK_LIMITS" | "PROFIT_SUMMARY" | "CALENDAR_TRACKER";

const DAY_MS = 24 * 60 * 60 * 1000;

function getPeriodCutoff(period: Period, now: Date) {
  if (period === "DAILY") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  const days = period === "WEEKLY" ? 7 : 30;
  return new Date(now.getTime() - days * DAY_MS);
}

export function computePeriodStats(trades: TradeDto[], period: Period, now = new Date()): PeriodStats {
  const cutoff = getPeriodCutoff(period, now);
  const periodTrades = trades.filter((trade) => {
    if (trade.status !== "CLOSED" || trade.closedAt === null) return false;
    return new Date(trade.closedAt).getTime() >= cutoff.getTime();
  });

  return {
    totalProfit: calculateTotalProfit(periodTrades).amount,
    winRate: calculateWinRate(periodTrades),
    tradeCount: periodTrades.length,
    riskReward: calculateAverageWinLossRatio(periodTrades),
  };
}
