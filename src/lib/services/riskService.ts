import { riskEvents, riskRules, trades, tradingAccounts } from "@/lib/data/mockData";
import { evaluateRiskRules } from "@/lib/domain/risk";

export async function listRiskRules() {
  return riskRules;
}

export async function listRiskEvents(accountId?: string) {
  if (!accountId) return riskEvents;
  return riskEvents.filter((event) => event.accountId === accountId);
}

export async function evaluateAccountRisk(accountId: string) {
  const account = tradingAccounts.find((item) => item.accountId === accountId);
  if (!account) return [];

  return evaluateRiskRules({
    account,
    trades: trades.filter((trade) => trade.accountId === accountId),
    rules: riskRules,
    dailyProfit: account.floatingPnl.amount,
  });
}
