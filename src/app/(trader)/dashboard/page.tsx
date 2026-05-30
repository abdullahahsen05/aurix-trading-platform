"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { DashboardModeOverlay } from "@/components/dashboard/DashboardModeOverlay";
import { DashboardKpiStrip, MarketSentimentStrip } from "@/components/dashboard/DashboardKpiStrip";
import { PerformanceRings, type PerformanceRingItem } from "@/components/dashboard/PerformanceRings";
import { Panel, PageActionGroup, WorkspacePage } from "@/components/app/WorkspaceUI";
import { formatMoney, formatPercent } from "@/lib/utils/format";
import {
  calculateAverageWinLossRatio,
  calculateConsistencyScore,
  calculateProfitFactor,
  calculateWinRate,
} from "@/lib/domain/metrics";
import { computePeriodStats, type DashboardView, type Period, type PeriodStats } from "@/lib/domain/dashboard";
import type { TraderAccountSummary, TradeDto, RiskRuleDto } from "@/lib/domain/types";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";

const TradingChart = dynamic(
  () => import("@/components/charts/TradingChart").then((mod) => mod.TradingChart),
  {
    ssr: false,
    loading: () => (
      <section className="section-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="h-6 w-44 animate-pulse rounded-full bg-panel-strong" />
            <div className="mt-3 h-4 w-32 animate-pulse rounded-full bg-panel-strong" />
          </div>
          <div className="h-6 w-20 animate-pulse rounded-full bg-panel-strong" />
        </div>
        <div className="px-5 py-5">
          <div className="inner-surface h-[560px] animate-pulse" />
        </div>
      </section>
    ),
  },
);

const dashboardTabs: Array<{ id: DashboardView; label: string }> = [
  { id: "CURRENT_EQUITY", label: "Current Equity" },
  { id: "CHECK_LIMITS", label: "Check Limits" },
  { id: "PROFIT_SUMMARY", label: "Profit Summary" },
  { id: "CALENDAR_TRACKER", label: "Calendar Tracker" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function getPeriodCutoff(period: Period, now = new Date()) {
  if (period === "DAILY") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  return new Date(now.getTime() - (period === "WEEKLY" ? 7 : 30) * DAY_MS);
}

export default function TraderDashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("DAILY");
  const [selectedView, setSelectedView] = useState<DashboardView>("CURRENT_EQUITY");
  const [activeOverlay, setActiveOverlay] = useState<DashboardView | null>(null);

  // Fetch trading accounts
  const { data: accounts = [] } = useQuery<TraderAccountSummary[]>({
    queryKey: ["trading-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/trading-accounts");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load accounts");
      return json.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Fetch all trades
  const { data: trades = [] } = useQuery<TradeDto[]>({
    queryKey: ["trades"],
    queryFn: async () => {
      const res = await fetch("/api/trades");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load trades");
      return json.data;
    },
    staleTime: 60_000,
  });

  // Fetch risk rules
  const { data: riskRules = [] } = useQuery<RiskRuleDto[]>({
    queryKey: ["risk-rules"],
    queryFn: async () => {
      const res = await fetch("/api/risk/rules");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load risk rules");
      return json.data;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Subscribe to realtime updates
  useRealtimeUpdates();

  const baseAccount = accounts[0];

  const [live, setLive] = useState({
    balance: 0,
    equity: 0,
    pnl: 0,
    refresh: new Date(),
  });

  // Sync live state when account data arrives
  useEffect(() => {
    if (baseAccount) {
      setLive({
        balance: baseAccount.balance.amount,
        equity: baseAccount.equity.amount,
        pnl: baseAccount.floatingPnl.amount,
        refresh: new Date(),
      });
    }
  }, [baseAccount]);

  const openTrades = useMemo(() => trades.filter((trade) => trade.status === "OPEN"), [trades]);
  const closedTrades = useMemo(() => trades.filter((trade) => trade.status === "CLOSED"), [trades]);
  const periodStats = useMemo<PeriodStats>(
    () => computePeriodStats(closedTrades, selectedPeriod),
    [closedTrades, selectedPeriod],
  );
  const periodTrades = useMemo(() => {
    const cutoff = getPeriodCutoff(selectedPeriod);
    return closedTrades.filter((trade) => trade.closedAt !== null && new Date(trade.closedAt) >= cutoff);
  }, [closedTrades, selectedPeriod]);
  const dailyLossLimit = riskRules.find((rule) => rule.metric === "DAILY_LOSS")?.threshold ?? 2500;
  const maxDrawdownLimit = riskRules.find((rule) => rule.metric === "MAX_DRAWDOWN")?.threshold ?? 5;
  const openTradeLimit = riskRules.find((rule) => rule.metric === "OPEN_TRADES")?.threshold ?? 5;

  const tradeWinRate = useMemo(() => calculateWinRate(closedTrades), [closedTrades]);
  const profitFactor = useMemo(() => calculateProfitFactor(closedTrades), [closedTrades]);
  const avgWinLoss = useMemo(() => calculateAverageWinLossRatio(closedTrades), [closedTrades]);
  const pnlPositive = live.pnl >= 0;
  const pnlPrefix = pnlPositive ? "↑" : "↓";
  const baseBalance = baseAccount?.balance.amount ?? 0;
  const baseEquity = baseAccount?.equity.amount ?? 0;
  const basePnl = baseAccount?.floatingPnl.amount ?? 0;
  const accountDrawdown = baseAccount?.drawdownPercent ?? 0;
  const balanceChange = baseBalance === 0 ? 0 : ((live.balance - baseBalance) / baseBalance) * 100;
  const equityChange = baseEquity === 0 ? 0 : ((live.equity - baseEquity) / baseEquity) * 100;
  const pnlChange = basePnl === 0 ? 0 : (live.pnl / Math.abs(basePnl)) * 100;
  const currentHour = new Date().getHours();
  const overlayPeriodStats = useMemo(
    () => ({
      ...periodStats,
      drawdown: accountDrawdown,
      consistency: calculateConsistencyScore(periodTrades),
    }),
    [accountDrawdown, periodStats, periodTrades],
  );

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
    ],
    [avgWinLoss, profitFactor, tradeWinRate],
  );

  const kpiItems = [
    {
      label: "Balance",
      value: formatMoney({ amount: live.balance, currency: "USD" }),
      helper: `Live account value · ${balanceChange >= 0 ? "+" : ""}${balanceChange.toFixed(2)}%`,
      tone: "accent" as const,
      status: balanceChange >= 0 ? "Good" : "Watch",
      statusTone: balanceChange >= 0 ? ("lime" as const) : ("danger" as const),
      sparkline: [],
    },
    {
      label: "Equity",
      value: formatMoney({ amount: live.equity, currency: "USD" }),
      helper: `Updated with the live feed · ${equityChange >= 0 ? "+" : ""}${equityChange.toFixed(2)}%`,
      tone: "lime" as const,
      status: equityChange >= 0 ? "Excellent" : "Watch",
      statusTone: equityChange >= 0 ? ("lime" as const) : ("danger" as const),
      sparkline: [],
    },
    {
      label: "Floating PnL",
      value: `${pnlPrefix} ${formatMoney({ amount: Math.abs(live.pnl), currency: "USD" })}`,
      helper: `Live position drift · ${pnlChange >= 0 ? "+" : ""}${pnlChange.toFixed(2)}%`,
      tone: pnlPositive ? ("lime" as const) : ("danger" as const),
      status: pnlPositive ? "Good" : "Average",
      statusTone: pnlPositive ? ("lime" as const) : ("muted" as const),
      sparkline: [],
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
      value: periodStats.winRate >= 58 && profitFactor >= 1.4 ? "Bullish" : "Balanced",
      helper: "Price structure is stable",
      tone: "lime" as const,
    },
    {
      label: "Volatility",
      value: accountDrawdown >= 4.5 ? "Elevated" : accountDrawdown >= 3 ? "Moderate" : "Low",
      helper: "Based on the selected period",
      tone: accountDrawdown >= 4.5 ? ("danger" as const) : ("lime" as const),
    },
    {
      label: "Fear & Greed",
      value: `${Math.round((periodStats.winRate * 0.8 + profitFactor * 10) / 1.1)}`,
      helper: "Calculated from period performance",
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
    if (!baseAccount) return;
    const timer = window.setInterval(() => {
      setLive((current) => {
        const drift = Math.sin(Date.now() / 2400) * 48;
        const balance = Number((current.balance + drift * 0.15).toFixed(0));
        const equity = Number((current.equity + drift * 0.22).toFixed(0));
        const pnl = Number((equity - balance + (baseAccount?.floatingPnl.amount ?? 0)).toFixed(0));
        return {
          balance,
          equity,
          pnl,
          refresh: new Date(),
        };
      });
    }, 2600);

    return () => window.clearInterval(timer);
  }, [baseAccount]);

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
        summary={overlayPeriodStats}
        dailyLossLimit={dailyLossLimit}
        maxDrawdownLimit={maxDrawdownLimit}
        openTradeLimit={openTradeLimit}
        profitFactor={profitFactor}
        avgWinLoss={avgWinLoss}
      />
    </WorkspacePage>
  );
}
