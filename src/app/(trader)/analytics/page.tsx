"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, TrendingDown, TrendingUp } from "lucide-react";
import {
  DataTable,
  InlineStatusStrip,
  GhostButton,
  Panel,
  PageActionGroup,
  PrimaryButton,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { EquityCurve } from "@/components/dashboard/EquityCurve";
import { analyticsSummary, equityCurve, trades } from "@/lib/data/mockData";
import { formatMoney, formatPercent } from "@/lib/utils/format";

const periods = ["DAILY", "WEEKLY", "MONTHLY", "ALL_TIME"] as const;

const kpiSnapshots = {
  DAILY: {
    netProfit: 1240,
    winRate: 61.2,
    riskUtilization: 47,
    avgR: 1.84,
    status: "Above baseline",
    note: "Intraday performance is constructive with contained risk pressure.",
  },
  WEEKLY: {
    netProfit: 6840,
    winRate: 58.6,
    riskUtilization: 53,
    avgR: 2.1,
    status: "Strong week",
    note: "Weekly output stays above average while risk remains disciplined.",
  },
  MONTHLY: {
    netProfit: 28740,
    winRate: 56.8,
    riskUtilization: 61,
    avgR: 2.36,
    status: "Healthy month",
    note: "Monthly performance is steady and the equity curve keeps rising.",
  },
  ALL_TIME: {
    netProfit: analyticsSummary.totalProfit.amount,
    winRate: analyticsSummary.winRatePercent,
    riskUtilization: Math.min((analyticsSummary.maxDrawdownPercent / 8) * 100, 100),
    avgR: analyticsSummary.riskRewardRatio,
    status: "Controlled",
    note: "All-time metrics remain balanced with a positive long-term slope.",
  },
} as const;

function DrawdownMeter({ value }: { value: number }) {
  const capped = Math.min(value, 12);
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Drawdown meter</h3>
          <p className="mt-1 text-xs text-muted">Current drawdown pressure across the live snapshot</p>
        </div>
        <StatusPill tone={value >= 6 ? "danger" : value >= 4 ? "accent" : "lime"}>
          {formatPercent(value)}
        </StatusPill>
      </div>
      <div className="mt-5 h-4 overflow-hidden rounded-full border border-line bg-background">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all"
          style={{ width: `${(capped / 12) * 100}%` }}
        />
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <span>0%</span>
        <span>6%</span>
        <span>12%</span>
      </div>
    </div>
  );
}

function GrowthGraph({ points }: { points: typeof equityCurve }) {
  const width = 800;
  const height = 220;
  const padding = 18;
  const values = points.map((point) => point.equity);
  const min = Math.min(...values) - 250;
  const max = Math.max(...values) + 250;
  const range = max - min || 1;
  const coordinates = points.map((point, index) => {
    const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((point.equity - min) / range) * (height - padding * 2);
    return { x, y };
  });
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Historical growth</h3>
          <p className="mt-1 text-xs text-muted">Equity growth across the current mock history</p>
        </div>
        <StatusPill tone="accent">Updated live</StatusPill>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-[220px] w-full" role="img" aria-label="Historical growth graph">
        <defs>
          <linearGradient id="analyticsGrowthGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffcf00" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ffcf00" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={padding}
            x2={width - padding}
            y1={height * ratio}
            y2={height * ratio}
            stroke="#1d1c17"
            strokeDasharray="5 8"
          />
        ))}
        <polygon points={`${padding},${height - padding} ${line} ${width - padding},${height - padding}`} fill="url(#analyticsGrowthGradient)" />
        <polyline points={line} fill="none" stroke="#ffcf00" strokeWidth="4" />
      </svg>
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<(typeof periods)[number]>("ALL_TIME");
  const [exportStatus, setExportStatus] = useState<string>("");
  const kpi = kpiSnapshots[period];

  const closedTrades = useMemo(() => trades.filter((trade) => trade.status === "CLOSED"), []);
  const winningTrades = closedTrades.filter((trade) => trade.profit.amount > 0);
  const losingTrades = closedTrades.filter((trade) => trade.profit.amount < 0);
  const averageWin = winningTrades.reduce((sum, trade) => sum + trade.profit.amount, 0) / Math.max(winningTrades.length, 1);
  const averageLoss = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.profit.amount, 0)) / Math.max(losingTrades.length, 1);

  const performanceRows = [
    ["Profit factor", analyticsSummary.riskRewardRatio.toFixed(2), "Higher is better"],
    ["Win rate", formatPercent(analyticsSummary.winRatePercent), "Closed trades only"],
    ["Consistency", formatPercent(analyticsSummary.consistencyScore), "Profitable trading days"],
    ["Average win", formatMoney({ amount: averageWin, currency: "USD" }), "Mean profitable trade"],
    ["Average loss", formatMoney({ amount: averageLoss, currency: "USD" }), "Mean losing trade"],
  ];

  return (
    <WorkspacePage
      eyebrow="Analytics"
      title="Performance intelligence"
      description="Profitability, drawdown, consistency, account growth, and risk-adjusted trade quality."
      action={
        <PageActionGroup>
          <GhostButton
            type="button"
            onClick={() => setExportStatus("PDF export queued. The mock report packet is ready to download next.")}
          >
            <Download className="mr-2 inline-block h-4 w-4" />
            Export PDF
          </GhostButton>
          <PrimaryButton
            type="button"
            onClick={() => setExportStatus("Excel export queued. The mock spreadsheet packet is ready.")}
          >
            <FileSpreadsheet className="mr-2 inline-block h-4 w-4" />
            Export Excel
          </PrimaryButton>
        </PageActionGroup>
      }
    >
      <div className="flex flex-wrap gap-2 rounded-full border border-line bg-panel p-1">
        {periods.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setPeriod(item)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              period === item ? "bg-accent text-background" : "text-muted hover:text-foreground"
            }`}
          >
            {item.replace("_", " ")}
          </button>
        ))}
      </div>

      {exportStatus ? (
        <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {exportStatus}
        </div>
      ) : null}

      <div className="mt-5">
        <InlineStatusStrip
          items={[
            { label: "Total profit", value: formatMoney(analyticsSummary.totalProfit), tone: "lime" },
            { label: "Win rate", value: formatPercent(analyticsSummary.winRatePercent) },
            {
              label: "Max drawdown",
              value: formatPercent(analyticsSummary.maxDrawdownPercent),
              tone: "accent",
            },
            { label: "Risk reward", value: analyticsSummary.riskRewardRatio },
            { label: "Consistency", value: formatPercent(analyticsSummary.consistencyScore) },
          ]}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.64fr_0.36fr]">
        <EquityCurve data={equityCurve} />
        <DrawdownMeter value={analyticsSummary.maxDrawdownPercent} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.64fr_0.36fr]">
        <Panel className="h-full">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Performance metrics</h2>
              <p className="mt-1 text-sm text-muted">A compact view of the account&apos;s trading quality</p>
            </div>
            <StatusPill tone="accent">Mock data</StatusPill>
          </div>
          <div className="mt-4">
            <DataTable
              headers={["Metric", "Value", "Notes"]}
              rows={performanceRows.map(([metric, value, notes]) => [
                <span key={metric} className="font-semibold text-foreground">
                  {metric}
                </span>,
                value,
                notes,
              ])}
            />
          </div>
        </Panel>

        <Panel className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">KPI dashboard</h2>
              <p className="mt-1 text-sm text-muted">Selected period: {period.replace("_", " ")}</p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-line bg-background p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Primary KPI</p>
                <p className="mt-3 text-5xl font-semibold text-accent-2">{formatMoney({ amount: kpi.netProfit, currency: "USD" })}</p>
                <p className="mt-2 max-w-md text-sm text-muted">Net profit for the selected period</p>
              </div>
              <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-foreground">
                Performance focused
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-background p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Win rate</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{formatPercent(kpi.winRate)}</p>
            </div>
            <div className="rounded-xl border border-line bg-background p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Risk utilization</p>
              <p className="mt-2 text-lg font-semibold text-accent">{formatPercent(kpi.riskUtilization)}</p>
            </div>
            <div className="rounded-xl border border-line bg-background p-4 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Average R</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{kpi.avgR.toFixed(2)}R</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-[#050602] p-4">
              <TrendingUp className="h-5 w-5 text-accent-2" />
              <div>
                <p className="text-sm font-semibold text-foreground">{kpi.status} trend</p>
                <p className="mt-1 text-xs text-muted">{kpi.note}</p>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.58fr_0.42fr]">
        <GrowthGraph points={equityCurve} />
        <Panel>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Risk-to-reward overview</h2>
              <p className="mt-1 text-sm text-muted">Closed-trade behavior across the mock ledger</p>
            </div>
            <TrendingDown className="h-5 w-5 text-danger" />
          </div>
          <div className="mt-5 space-y-3">
            {[
              ["Winning trades", winningTrades.length.toString(), "Positive profit"],
              ["Losing trades", losingTrades.length.toString(), "Controlled drawdown"],
              ["Closed trades", closedTrades.length.toString(), "Current review set"],
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-xl border border-line bg-background p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-muted">{label}</span>
                  <span className="text-sm font-semibold text-foreground">{value}</span>
                </div>
                <p className="mt-2 text-xs text-muted">{note}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
