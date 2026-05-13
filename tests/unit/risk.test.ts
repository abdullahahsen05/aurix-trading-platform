import { describe, expect, test } from "vitest";
import { evaluateRiskRules, shouldRestrictAccount } from "@/lib/domain/risk";
import type { RiskRuleDto, TradeDto, TraderAccountSummary } from "@/lib/domain/types";

const account: TraderAccountSummary = {
  accountId: "a1",
  accountName: "Evaluation 100K",
  brokerName: "MetaTrader 5 Demo",
  status: "CONNECTED",
  balance: { amount: 100000, currency: "USD" },
  equity: { amount: 96000, currency: "USD" },
  floatingPnl: { amount: -1200, currency: "USD" },
  openTradeCount: 2,
  drawdownPercent: 6,
  updatedAt: "2026-05-11T00:00:00.000Z",
};

const rules: RiskRuleDto[] = [
  {
    id: "daily",
    scope: "PLATFORM",
    name: "Daily loss limit",
    severity: "CRITICAL",
    metric: "DAILY_LOSS",
    threshold: 1000,
    enabled: true,
  },
  {
    id: "drawdown",
    scope: "PLATFORM",
    name: "Max drawdown",
    severity: "WARNING",
    metric: "MAX_DRAWDOWN",
    threshold: 5,
    enabled: true,
  },
];

const trades: TradeDto[] = [
  {
    id: "open-1",
    accountId: "a1",
    symbol: "XAUUSD",
    side: "BUY",
    status: "OPEN",
    volume: 1,
    openPrice: 2300,
    closePrice: null,
    profit: { amount: -100, currency: "USD" },
    openedAt: "2026-05-11T00:00:00.000Z",
    closedAt: null,
  },
];

describe("risk", () => {
  test("creates events for breached risk rules", () => {
    const events = evaluateRiskRules({ account, trades, rules, dailyProfit: -1200 });

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.ruleName)).toEqual(["Daily loss limit", "Max drawdown"]);
  });

  test("restricts account when critical event exists", () => {
    const events = evaluateRiskRules({ account, trades, rules, dailyProfit: -1200 });

    expect(shouldRestrictAccount(events)).toBe(true);
  });

  test("does not create events when rules are not breached", () => {
    const events = evaluateRiskRules({
      account: { ...account, drawdownPercent: 1 },
      trades,
      rules,
      dailyProfit: 100,
    });

    expect(events).toEqual([]);
  });
});
