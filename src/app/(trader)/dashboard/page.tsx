"use client";

import { useEffect, useMemo, useState } from "react";
import { riskRules, trades, tradingAccounts } from "@/lib/data/mockData";
import { TradingChart } from "@/components/charts/TradingChart";
import { DashboardModeOverlay } from "@/components/dashboard/DashboardModeOverlay";
import { DashboardKpiStrip, MarketSentimentStrip } from "@/components/dashboard/DashboardKpiStrip";
import { PerformanceRings, type PerformanceRingItem } from "@/components/dashboard/PerformanceRings";
import { Panel, PageActionGroup, WorkspacePage } from "@/components/app/WorkspaceUI";
import { formatMoney, formatPercent } from "@/lib/utils/format";
import {
  calculateAverageWinLossRatio,
  calculateProfitFactor,
  calculateWinRate,
} from "@/lib/domain/metrics";
import type { DashboardView, Period } from "@/lib/domain/dashboard";

const baseAccount = tradingAccounts[0];

const dashboardTabs: Array<{ id: DashboardView; label: string }> = [
  { id: "CURRENT_EQUITY", label: "Current Equity" },
  { id: "CHECK_LIMITS", label: "Check Limits" },
  { id: "PROFIT_SUMMARY", label: "Profit Summary" },
  { id: "CALENDAR_TRACKER", label: "Calendar Tracker" },
];

const periodSummaries: Record<
  Period,
  {
    totalProfit: number;
    winRate: number;
    drawdown: number;
    consistency: number;
    tradeCount: number;
    riskReward: number;
  }
> = {
  DAILY: {
    totalProfit: 1240,
    winRate: 61.2,
    drawdown: 1.9,
    consistency: 78.4,
    tradeCount: 6,
    riskReward: 2.3,
  },
  WEEKLY: {
    totalProfit: 6840,
    winRate: 58.6,
    drawdown: 3.7,
    consistency: 71.2,
    tradeCount: 18,
    riskReward: 2.7,
  },
  MONTHLY: {
    totalProfit: 28740,
    winRate: 56.8,
    drawdown: 4.9,
    consistency: 67.5,
    tradeCount: 44,
    riskReward: 2.5,
  },
};

function buildSparkline(seed: number, direction: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const wave = Math.sin(seed * 0.14 + index * 0.6) * 0.16;
    const drift = index * direction * 0.035;
    return Number((0.42 + wave + drift).toFixed(3));
  });
}

export default function TraderDashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("DAILY");
  const [selectedView, setSelectedView] = useState<DashboardView>("CURRENT_EQUITY");
  const [activeOverlay, setActiveOverlay] = useState<DashboardView | null>(null);
  const [live, setLive] = useState({
    balance: baseAccount.balance.amount,
    equity: baseAccount.equity.amount,
    pnl: baseAccount.floatingPnl.amount,
    refresh: new Date(),
  });

  const openTrades = useMemo(() => trades.filter((trade) => trade.status === "OPEN"), []);
  const closedTrades = useMemo(() => trades.filter((trade) => trade.status === "CLOSED"), []);
  const summary = periodSummaries[selectedPeriod];
  const dailyLossLimit = riskRules.find((rule) => rule.metric === "DAILY_LOSS")?.threshold ?? 2500;
  const maxDrawdownLimit = riskRules.find((rule) => rule.metric === "MAX_DRAWDOWN")?.threshold ?? 5;
  const openTradeLimit = riskRules.find((rule) => rule.metric === "OPEN_TRADES")?.threshold ?? 5;

  const tradeWinRate = useMemo(() => calculateWinRate(closedTrades), [closedTrades]);
  const profitFactor = useMemo(() => calculateProfitFactor(closedTrades), [closedTrades]);
  const avgWinLoss = useMemo(() => calculateAverageWinLossRatio(closedTrades), [closedTrades]);
  const pnlPositive = live.pnl >= 0;
  const pnlPrefix = pnlPositive ? "↑" : "↓";
  const balanceChange = ((live.balance - baseAccount.balance.amount) / baseAccount.balance.amount) * 100;
  const equityChange = ((live.equity - baseAccount.equity.amount) / baseAccount.equity.amount) * 100;
  const pnlChange = baseAccount.floatingPnl.amount === 0 ? 0 : (live.pnl / Math.abs(baseAccount.floatingPnl.amount)) * 100;
  const currentHour = new Date().getHours();

  const performanceRings = useMemo<PerformanceRingItem[]>(
    () => [
      {
        label: "Win %",
        value: formatPercent(tradeWinRate),
        status: tradeWinRate >= 60 ? "Excellent" : tradeWinRate >= 50 ? "Good" : "Average",
        statusTone: tradeWinRate >= 60 ? ("lime" as const) : tradeWinRate >= 50 ? ("accent" as const) : ("muted" as const),
        progress: tradeWinRate / 100,
        tone: "yellow" as const,
      },
      {
        label: "Profit Factor",
        value: profitFactor.toFixed(2),
        status: profitFactor >= 2 ? "Excellent" : profitFactor >= 1.4 ? "Good" : "Average",
        statusTone: profitFactor >= 2 ? ("lime" as const) : profitFactor >= 1.4 ? ("accent" as const) : ("muted" as const),
        progress: Math.min(profitFactor / 4, 1),
        tone: "lime" as const,
      },
      {
        label: "Win/Loss",
        value: avgWinLoss.toFixed(2),
        status: avgWinLoss >= 1.8 ? "Good" : "Average",
        statusTone: avgWinLoss >= 1.8 ? ("accent" as const) : ("muted" as const),
        progress: Math.min(avgWinLoss / 4, 1),
        tone: "yellow" as const,
      },
      {
        label: "Win Rate",
        value: formatPercent(summary.winRate),
        status: summary.winRate >= 60 ? "Excellent" : summary.winRate >= 55 ? "Good" : "Average",
        statusTone: summary.winRate >= 60 ? ("lime" as const) : summary.winRate >= 55 ? ("accent" as const) : ("muted" as const),
        progress: summary.winRate / 100,
        tone: "lime" as const,
      },
      {
        label: "Risk/Reward",
        value: summary.riskReward.toFixed(2),
        status: summary.riskReward >= 2.5 ? "Excellent" : summary.riskReward >= 2 ? "Good" : "Average",
        statusTone: summary.riskReward >= 2.5 ? ("lime" as const) : summary.riskReward >= 2 ? ("accent" as const) : ("muted" as const),
        progress: Math.min(summary.riskReward / 4, 1),
        tone: "yellow" as const,
      },
    ],
    [avgWinLoss, profitFactor, summary.riskReward, summary.winRate, tradeWinRate],
  );

  const kpiItems = [
    {
      label: "Balance",
      value: formatMoney({ amount: live.balance, currency: "USD" }),
      helper: `Live account value · ${balanceChange >= 0 ? "+" : ""}${balanceChange.toFixed(2)}%`,
      tone: "accent" as const,
      status: balanceChange >= 0 ? "Good" : "Watch",
      statusTone: balanceChange >= 0 ? ("lime" as const) : ("danger" as const),
      sparkline: buildSparkline(live.balance, 1),
    },
    {
      label: "Equity",
      value: formatMoney({ amount: live.equity, currency: "USD" }),
      helper: `Updated with the live feed · ${equityChange >= 0 ? "+" : ""}${equityChange.toFixed(2)}%`,
      tone: "lime" as const,
      status: equityChange >= 0 ? "Excellent" : "Watch",
      statusTone: equityChange >= 0 ? ("lime" as const) : ("danger" as const),
      sparkline: buildSparkline(live.equity, 1.25),
    },
    {
      label: "Floating PnL",
      value: `${pnlPrefix} ${formatMoney({ amount: Math.abs(live.pnl), currency: "USD" })}`,
      helper: `Live position drift · ${pnlChange >= 0 ? "+" : ""}${pnlChange.toFixed(2)}%`,
      tone: pnlPositive ? ("lime" as const) : ("danger" as const),
      status: pnlPositive ? "Good" : "Average",
      statusTone: pnlPositive ? ("lime" as const) : ("muted" as const),
      sparkline: buildSparkline(live.pnl, pnlPositive ? 1.5 : -1.5),
    },
  ];

  const marketSentimentItems = [
    {
      label: "Session",
      value: currentHour < 7 ? "Asia late" : currentHour < 13 ? "London" : currentHour < 19 ? "New York" : "Overnight",
      helper: "Current market window",
      tone: "accent" as const,
    },
    {
      label: "Trend Bias",
      value: summary.winRate >= 58 && profitFactor >= 1.4 ? "Bullish" : "Balanced",
      helper: "Price structure is stable",
      tone: "lime" as const,
    },
    {
      label: "Volatility",
      value: summary.drawdown >= 4.5 ? "Elevated" : summary.drawdown >= 3 ? "Moderate" : "Low",
      helper: "Based on the selected period",
      tone: summary.drawdown >= 4.5 ? ("danger" as const) : ("lime" as const),
    },
    {
      label: "Fear & Greed",
      value: `${Math.round((summary.winRate * 0.45 + summary.consistency * 0.35 + profitFactor * 10) / 1.1)}`,
      helper: "Mock market sentiment score",
      tone: "accent" as const,
    },
    {
      label: "Spread",
      value: "1.2 pts",
      helper: "Tight execution band",
      tone: "lime" as const,
    },
  ];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLive((current) => {
        const drift = Math.sin(Date.now() / 2400) * 48;
        const balance = Number((current.balance + drift * 0.15).toFixed(0));
        const equity = Number((current.equity + drift * 0.22).toFixed(0));
        const pnl = Number((equity - balance + baseAccount.floatingPnl.amount).toFixed(0));
        return {
          balance,
          equity,
          pnl,
          refresh: new Date(),
        };
      });
    }, 2600);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <WorkspacePage
      eyebrow="Trader workspace"
      title="Trading overview"
      description="Equity, risk, and performance across your connected accounts."
      action={
        <PageActionGroup>
          {dashboardTabs.map((tab) => {
            const active = selectedView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedView(tab.id);
                  setActiveOverlay(tab.id);
                }}
                className={`btn-dark h-9 px-4 text-xs ${active ? "btn-active" : ""}`}
              >
                {tab.label}
              </button>
            );
          })}
        </PageActionGroup>
      }
    >
      <DashboardKpiStrip items={kpiItems} />

      <div className="mt-4">
        <MarketSentimentStrip items={marketSentimentItems} />
      </div>

      <Panel className="mt-4">
        <PerformanceRings items={performanceRings} />
      </Panel>

      <div className="mt-4">
        <TradingChart />
      </div>

      <DashboardModeOverlay
        open={activeOverlay !== null}
        view={activeOverlay}
        onOpenChange={(open) => {
          if (!open) setActiveOverlay(null);
        }}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        live={live}
        openTrades={openTrades}
        trades={trades}
        summary={summary}
        dailyLossLimit={dailyLossLimit}
        maxDrawdownLimit={maxDrawdownLimit}
        openTradeLimit={openTradeLimit}
        profitFactor={profitFactor}
        avgWinLoss={avgWinLoss}
      />
    </WorkspacePage>
  );
}
