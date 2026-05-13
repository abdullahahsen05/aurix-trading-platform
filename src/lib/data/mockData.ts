import { buildAnalyticsSummary } from "@/lib/domain/metrics";
import type {
  AdminSummaryDto,
  CrmNoteDto,
  EquityPoint,
  RiskEventDto,
  RiskRuleDto,
  TradeDto,
  TraderAccountSummary,
  TraderProfileDto,
} from "@/lib/domain/types";

const base = Date.UTC(2026, 4, 11, 12, 0, 0);
const isoHoursAgo = (hours: number) => new Date(base - hours * 60 * 60 * 1000).toISOString();
const usd = (amount: number) => ({ amount, currency: "USD" });

export const tradingAccounts: TraderAccountSummary[] = [
  {
    accountId: "acc-orion-001",
    accountName: "Orion Growth 100K",
    brokerName: "MetaTrader 5 Demo",
    status: "CONNECTED",
    balance: usd(102480),
    equity: usd(103142),
    floatingPnl: usd(662),
    openTradeCount: 3,
    drawdownPercent: 3.7,
    updatedAt: isoHoursAgo(0),
  },
  {
    accountId: "acc-nova-002",
    accountName: "Nova Evaluation 50K",
    brokerName: "MetaApi Sandbox",
    status: "SYNCING",
    balance: usd(49820),
    equity: usd(49296),
    floatingPnl: usd(-524),
    openTradeCount: 2,
    drawdownPercent: 5.4,
    updatedAt: isoHoursAgo(1),
  },
];

export const equityCurve: EquityPoint[] = Array.from({ length: 28 }, (_, index) => {
  const drift = index * 118;
  const pulse = Math.sin(index / 2) * 520;
  const balance = 100000 + drift;
  return {
    capturedAt: isoHoursAgo((27 - index) * 6),
    balance: Number(balance.toFixed(2)),
    equity: Number((balance + pulse).toFixed(2)),
  };
});

export const trades: TradeDto[] = [
  ...Array.from({ length: 14 }, (_, index): TradeDto => {
    const profit = index % 4 === 0 ? -240 - index * 11 : 320 + index * 17;
    return {
      id: `closed-${index + 1}`,
      accountId: index % 3 === 0 ? "acc-nova-002" : "acc-orion-001",
      symbol: ["EURUSD", "XAUUSD", "GBPJPY", "NAS100"][index % 4],
      side: index % 2 === 0 ? "BUY" : "SELL",
      status: "CLOSED",
      volume: Number((0.4 + index * 0.05).toFixed(2)),
      openPrice: 1.08 + index * 0.006,
      closePrice: 1.082 + index * 0.006,
      profit: usd(profit),
      openedAt: isoHoursAgo(120 - index * 6),
      closedAt: isoHoursAgo(116 - index * 6),
    };
  }),
  {
    id: "open-1",
    accountId: "acc-orion-001",
    symbol: "XAUUSD",
    side: "BUY",
    status: "OPEN",
    volume: 0.8,
    openPrice: 2341.4,
    closePrice: null,
    profit: usd(418),
    openedAt: isoHoursAgo(5),
    closedAt: null,
  },
  {
    id: "open-2",
    accountId: "acc-orion-001",
    symbol: "EURUSD",
    side: "SELL",
    status: "OPEN",
    volume: 1.2,
    openPrice: 1.0872,
    closePrice: null,
    profit: usd(244),
    openedAt: isoHoursAgo(4),
    closedAt: null,
  },
  {
    id: "open-3",
    accountId: "acc-nova-002",
    symbol: "NAS100",
    side: "SELL",
    status: "OPEN",
    volume: 0.3,
    openPrice: 18422,
    closePrice: null,
    profit: usd(-524),
    openedAt: isoHoursAgo(3),
    closedAt: null,
  },
];

export const analyticsSummary = buildAnalyticsSummary(
  "acc-orion-001",
  trades.filter((trade) => trade.accountId === "acc-orion-001"),
  equityCurve,
);

export const riskRules: RiskRuleDto[] = [
  {
    id: "rule-daily-loss",
    scope: "PLATFORM",
    name: "Daily loss limit",
    severity: "CRITICAL",
    metric: "DAILY_LOSS",
    threshold: 2500,
    enabled: true,
  },
  {
    id: "rule-drawdown",
    scope: "PLATFORM",
    name: "Maximum drawdown",
    severity: "WARNING",
    metric: "MAX_DRAWDOWN",
    threshold: 5,
    enabled: true,
  },
  {
    id: "rule-open-trades",
    scope: "ACCOUNT",
    name: "Open trade concentration",
    severity: "INFO",
    metric: "OPEN_TRADES",
    threshold: 5,
    enabled: true,
  },
];

export const riskEvents: RiskEventDto[] = [
  {
    id: "risk-001",
    accountId: "acc-nova-002",
    ruleName: "Maximum drawdown",
    severity: "WARNING",
    message: "Nova Evaluation 50K is over the 5% drawdown warning threshold.",
    createdAt: isoHoursAgo(2),
  },
];

export const traders: TraderProfileDto[] = [
  {
    traderId: "trader-001",
    name: "Ayan Malik",
    email: "ayan@example.com",
    segment: "FUNDED",
    accountCount: 2,
    totalEquity: usd(152438),
    lastActivityAt: isoHoursAgo(1),
  },
  {
    traderId: "trader-002",
    name: "Sara Khan",
    email: "sara@example.com",
    segment: "AT_RISK",
    accountCount: 1,
    totalEquity: usd(49296),
    lastActivityAt: isoHoursAgo(3),
  },
];

export const crmNotes: CrmNoteDto[] = [
  {
    id: "note-001",
    traderId: "trader-001",
    authorName: "Admin",
    note: "Requested MT5 investor password and broker server confirmation.",
    createdAt: isoHoursAgo(10),
  },
  {
    id: "note-002",
    traderId: "trader-002",
    authorName: "Risk Desk",
    note: "Warned trader about drawdown proximity and reduced position sizing.",
    createdAt: isoHoursAgo(2),
  },
];

export const adminSummary: AdminSummaryDto = {
  activeTraders: 128,
  connectedAccounts: 214,
  openRiskEvents: riskEvents.length,
  monthlyRecurringRevenue: usd(18400),
};
