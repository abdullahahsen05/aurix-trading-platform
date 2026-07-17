import { describe, expect, test } from "vitest";
import { evaluateRiskRules, shouldRestrictAccount } from "@/lib/domain/risk";
import type { RiskRuleDto, TradeDto, TraderAccountSummary } from "@/lib/domain/types";

const account: TraderAccountSummary = {
  accountId: "a1",
  accountName: "Evaluation 100K",
  brokerName: "MetaTrader 5 Demo",
  serverName: "Demo-Server",
  platform: "MT5",
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
    shortTradeId: "TRD-00000001",
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

  test("creates event for open trade count breach", () => {
    const openTradesRule: RiskRuleDto = {
      id: "open-trades",
      scope: "PLATFORM",
      name: "Max 3 open trades",
      severity: "INFO",
      metric: "OPEN_TRADES",
      threshold: 3,
      enabled: true,
    };

    // openTradeCount comes from account, not from trades array
    const accountWith3Trades = { ...account, openTradeCount: 3 };
    const events = evaluateRiskRules({
      account: accountWith3Trades,
      trades: [],  // trades array is not used for OPEN_TRADES metric
      rules: [openTradesRule],
      dailyProfit: 0,
    });

    expect(events).toHaveLength(1);
    expect(events[0].ruleName).toBe("Max 3 open trades");
    expect(events[0].message).toContain("Open trades: 3");
  });

  test("message includes account name, metric, threshold, and observed value", () => {
    const events = evaluateRiskRules({ account, trades, rules, dailyProfit: -1200 });
    const ddEvent = events.find((e) => e.ruleName === "Max drawdown");
    expect(ddEvent?.message).toContain("Evaluation 100K");
    expect(ddEvent?.message).toContain("Drawdown:");
    expect(ddEvent?.message).toContain("threshold:");
  });
});
