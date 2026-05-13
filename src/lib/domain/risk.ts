import type { RiskEventDto, RiskRuleDto, TraderAccountSummary, TradeDto } from "./types";

export interface RiskEvaluationInput {
  account: TraderAccountSummary;
  trades: TradeDto[];
  rules: RiskRuleDto[];
  dailyProfit: number;
}

export function evaluateRiskRules(input: RiskEvaluationInput): RiskEventDto[] {
  const { account, trades, rules, dailyProfit } = input;
  const openTradeCount = trades.filter((trade) => trade.status === "OPEN").length;

  return rules
    .filter((rule) => rule.enabled)
    .flatMap((rule) => {
      const breached =
        (rule.metric === "DAILY_LOSS" && dailyProfit <= -Math.abs(rule.threshold)) ||
        (rule.metric === "MAX_DRAWDOWN" && account.drawdownPercent >= rule.threshold) ||
        (rule.metric === "OPEN_TRADES" && openTradeCount >= rule.threshold);

      if (!breached) return [];

      return {
        id: `${account.accountId}-${rule.id}`,
        accountId: account.accountId,
        ruleName: rule.name,
        severity: rule.severity,
        message: `${rule.name} breached for ${account.accountName}`,
        createdAt: account.updatedAt,
      };
    });
}

export function shouldRestrictAccount(events: RiskEventDto[]): boolean {
  return events.some((event) => event.severity === "CRITICAL");
}
