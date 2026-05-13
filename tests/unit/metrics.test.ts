import { describe, expect, test } from "vitest";
import {
  buildAnalyticsSummary,
  calculateMaxDrawdown,
  calculateRiskRewardRatio,
  calculateTotalProfit,
  calculateWinRate,
} from "@/lib/domain/metrics";
import type { EquityPoint, TradeDto } from "@/lib/domain/types";

const usd = (amount: number) => ({ amount, currency: "USD" });

const trades: TradeDto[] = [
  {
    id: "t1",
    accountId: "a1",
    symbol: "EURUSD",
    side: "BUY",
    status: "CLOSED",
    volume: 1,
    openPrice: 1,
    closePrice: 1.1,
    profit: usd(300),
    openedAt: "2026-05-01T00:00:00.000Z",
    closedAt: "2026-05-01T01:00:00.000Z",
  },
  {
    id: "t2",
    accountId: "a1",
    symbol: "XAUUSD",
    side: "SELL",
    status: "CLOSED",
    volume: 1,
    openPrice: 2300,
    closePrice: 2310,
    profit: usd(-100),
    openedAt: "2026-05-02T00:00:00.000Z",
    closedAt: "2026-05-02T01:00:00.000Z",
  },
  {
    id: "t3",
    accountId: "a1",
    symbol: "GBPUSD",
    side: "BUY",
    status: "OPEN",
    volume: 1,
    openPrice: 1.2,
    closePrice: null,
    profit: usd(25),
    openedAt: "2026-05-03T00:00:00.000Z",
    closedAt: null,
  },
];

const equityCurve: EquityPoint[] = [
  { capturedAt: "2026-05-01T00:00:00.000Z", balance: 100000, equity: 100000 },
  { capturedAt: "2026-05-02T00:00:00.000Z", balance: 100000, equity: 99000 },
  { capturedAt: "2026-05-03T00:00:00.000Z", balance: 100000, equity: 101000 },
];

describe("metrics", () => {
  test("calculates total profit from closed trades only", () => {
    expect(calculateTotalProfit(trades)).toEqual({ amount: 200, currency: "USD" });
  });

  test("calculates win rate from closed trades only", () => {
    expect(calculateWinRate(trades)).toBe(50);
  });

  test("calculates max drawdown from equity peaks", () => {
    expect(calculateMaxDrawdown(equityCurve)).toBe(1);
  });

  test("calculates risk reward ratio from average win and loss", () => {
    expect(calculateRiskRewardRatio(trades)).toBe(3);
  });

  test("builds an account analytics summary", () => {
    expect(buildAnalyticsSummary("a1", trades, equityCurve)).toMatchObject({
      accountId: "a1",
      tradeCount: 2,
      totalProfit: { amount: 200, currency: "USD" },
      winRatePercent: 50,
    });
  });
});
