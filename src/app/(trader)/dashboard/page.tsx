"use client";

import { useEffect, useMemo, useState } from "react";
import { riskRules, trades, tradingAccounts } from "@/lib/data/mockData";
import { TradingChart } from "@/components/charts/TradingChart";
import { DashboardModeOverlay } from "@/components/dashboard/DashboardModeOverlay";
import { PerformanceRings } from "@/components/dashboard/PerformanceRings";
import { InlineStatusStrip, Panel, PageActionGroup, WorkspacePage } from "@/components/app/WorkspaceUI";
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

  const performanceRings = useMemo(
    () => [
      {
        label: "Trade Win %",
        value: formatPercent(tradeWinRate),
        caption: "Current percentage",
        progress: tradeWinRate / 100,
        tone: "yellow" as const,
      },
      {
        label: "Profit Factor",
        value: profitFactor.toFixed(2),
        caption: "Current ratio",
        progress: Math.min(profitFactor / 4, 1),
        tone: "lime" as const,
      },
      {
        label: "Avg Win/Loss",
        value: avgWinLoss.toFixed(2),
        caption: "Current ratio",
        progress: Math.min(avgWinLoss / 4, 1),
        tone: "yellow" as const,
      },
      {
        label: "Win Rate",
        value: formatPercent(summary.winRate),
        caption: "Selected period",
        progress: summary.winRate / 100,
        tone: "lime" as const,
      },
      {
        label: "Avg Risk Reward",
        value: summary.riskReward.toFixed(2),
        caption: "Selected period",
        progress: Math.min(summary.riskReward / 4, 1),
        tone: "yellow" as const,
      },
    ],
    [avgWinLoss, profitFactor, summary.riskReward, summary.winRate, tradeWinRate],
  );

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
                className={`h-11 rounded-full border px-5 text-sm font-semibold transition ${
                  active
                    ? "border-[#2f2610] bg-[#14120d] text-accent shadow-[inset_0_0_0_1px_rgba(255,207,0,0.12)]"
                    : "border-line bg-background text-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </PageActionGroup>
      }
    >
      <InlineStatusStrip
        items={[
          {
            label: "Balance",
            value: formatMoney({ amount: live.balance, currency: "USD" }),
            helper: "Live mock account value",
          },
          {
            label: "Equity",
            value: formatMoney({ amount: live.equity, currency: "USD" }),
            helper: "Updated with the live feed",
            tone: "accent",
          },
          {
            label: "Floating PnL",
            value: (
              <span
                className={`inline-flex items-center gap-2 ${
                  pnlPositive ? "text-accent-2" : "text-danger"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    pnlPositive ? "bg-accent-2" : "bg-danger"
                  } animate-pulse`}
                />
                {pnlPrefix} {formatMoney({ amount: Math.abs(live.pnl), currency: "USD" })}
              </span>
            ),
            helper: "Live position drift",
            tone: pnlPositive ? "lime" : "danger",
          },
        ]}
      />

      <Panel>
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
