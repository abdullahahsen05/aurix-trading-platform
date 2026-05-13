import { analyticsSummary, equityCurve, trades } from "@/lib/data/mockData";
import { buildAnalyticsSummary } from "@/lib/domain/metrics";

export async function getAnalyticsSummary(accountId: string) {
  if (accountId === analyticsSummary.accountId) return analyticsSummary;

  return buildAnalyticsSummary(
    accountId,
    trades.filter((trade) => trade.accountId === accountId),
    equityCurve,
  );
}

export async function getEquityCurve(accountId: string) {
  return equityCurve.map((point) => ({ ...point, accountId }));
}
