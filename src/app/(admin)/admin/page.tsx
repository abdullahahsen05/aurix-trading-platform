 "use client";

import { useState } from "react";
import {
  DataTable,
  Panel,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { AdminOverviewOverlay, type AdminOverviewView } from "@/components/admin/AdminOverviewOverlay";
import { PerformanceRings } from "@/components/dashboard/PerformanceRings";
import { EquityCurve } from "@/components/dashboard/EquityCurve";
import {
  adminSummary,
  crmNotes,
  equityCurve,
  riskEvents,
  riskRules,
  traders,
  tradingAccounts,
  trades,
} from "@/lib/data/mockData";
import {
  calculateTotalProfit,
  calculateConsistencyScore,
  calculateMaxDrawdown,
} from "@/lib/domain/metrics";
import { formatMoney, formatPercent } from "@/lib/utils/format";

const adminTabs: Array<{ key: AdminOverviewView; label: string }> = [
  { key: "OVERVIEW", label: "Overview" },
  { key: "ACCOUNTS", label: "Accounts" },
  { key: "RISK_QUEUE", label: "Risk Queue" },
  { key: "CRM", label: "CRM" },
];

const platformRings = [
  {
    label: "Active Traders",
    value: `${adminSummary.activeTraders}`,
    status: "Excellent",
    statusTone: "lime" as const,
    progress: Math.min(adminSummary.activeTraders / 150, 1),
    tone: "yellow" as const,
  },
  {
    label: "Connected Accounts",
    value: `${adminSummary.connectedAccounts}`,
    status: "Good",
    statusTone: "accent" as const,
    progress: Math.min(adminSummary.connectedAccounts / 250, 1),
    tone: "lime" as const,
  },
  {
    label: "Open Risk Events",
    value: `${adminSummary.openRiskEvents}`,
    status: adminSummary.openRiskEvents > 0 ? "Watch" : "Stable",
    statusTone: adminSummary.openRiskEvents > 0 ? ("danger" as const) : ("lime" as const),
    progress: Math.max(0.08, 1 - adminSummary.openRiskEvents / 10),
    tone: "yellow" as const,
  },
  {
    label: "MRR",
    value: formatMoney(adminSummary.monthlyRecurringRevenue),
    status: "Good",
    statusTone: "accent" as const,
    progress: Math.min(adminSummary.monthlyRecurringRevenue.amount / 20000, 1),
    tone: "lime" as const,
  },
  {
    label: "Accounts Under Supervision",
    value: `${tradingAccounts.length}`,
    status: "Stable",
    statusTone: "lime" as const,
    progress: Math.min(tradingAccounts.length / 10, 1),
    tone: "yellow" as const,
  },
] satisfies Array<{
  label: string;
  value: string;
  status: string;
  statusTone: "accent" | "lime" | "muted" | "danger";
  progress: number;
  tone?: "yellow" | "lime";
}>;

export default function AdminOverviewPage() {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayView, setOverlayView] = useState<AdminOverviewView>("OVERVIEW");

  const openView = (view: AdminOverviewView) => {
    setOverlayView(view);
    setOverlayOpen(true);
  };

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="Platform overview"
      description="A single calm operations dashboard for traders, accounts, risk, subscriptions, and audits."
    >
      <Panel>
        <div className="flex flex-wrap gap-3">
          {adminTabs.map((tab) => {
            const active = overlayView === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => openView(tab.key)}
                className={`btn-dark h-9 px-4 text-xs ${active ? "btn-active" : ""}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          <PerformanceRings items={platformRings} />
        </div>
      </Panel>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.68fr_0.32fr]">
        <EquityCurve
          data={equityCurve}
          title="Platform oversight"
          description="A calm trend line for operational health and account movement across the platform."
        />
        <Panel>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Platform health</h2>
              <p className="mt-1 text-sm text-muted">
                Summary signals for support, supervision, and admin follow-up.
              </p>
            </div>
            <StatusPill tone="lime">Stable</StatusPill>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Net profit</p>
              <p className="mt-2 text-sm font-semibold text-accent-2">
                {formatMoney(calculateTotalProfit(trades))}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Closed trades</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {trades.filter((trade) => trade.status === "CLOSED").length}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Max drawdown</p>
              <p className="mt-2 text-sm font-semibold text-danger">
                {formatPercent(calculateMaxDrawdown(equityCurve))}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Consistency</p>
              <p className="mt-2 text-sm font-semibold text-accent">
                {formatPercent(calculateConsistencyScore(trades))}
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-line bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Summary</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {trades.filter((trade) => trade.status === "CLOSED").length} closed trades are represented in the mock platform snapshot, with
              {` ${tradingAccounts.length} accounts`} currently under supervision.
            </p>
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.58fr_0.42fr]">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Trader watchlist</h2>
            <StatusPill tone="muted">Live review</StatusPill>
          </div>
          <div className="mt-4">
            <DataTable
              headers={["Trader", "Segment", "Accounts", "Equity", "Last active"]}
              rows={traders.map((trader) => [
                <span key="name" className="font-semibold text-foreground">
                  {trader.name}
                </span>,
                <StatusPill
                  key="segment"
                  tone={trader.segment === "AT_RISK" ? "accent" : "lime"}
                >
                  {trader.segment}
                </StatusPill>,
                trader.accountCount,
                <span key="equity" className="font-semibold text-accent-2">
                  {formatMoney(trader.totalEquity)}
                </span>,
                new Date(trader.lastActivityAt).toLocaleString(),
              ])}
            />
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Risk queue</h2>
            <StatusPill tone="accent">Needs attention</StatusPill>
          </div>
          <div className="mt-4 space-y-3">
            {riskEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-line bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-foreground">{event.ruleName}</p>
                  <StatusPill tone="accent">{event.severity}</StatusPill>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{event.message}</p>
              </div>
            ))}
            <div className="rounded-xl border border-line bg-background p-4">
              <p className="text-sm font-semibold text-muted">Accounts under supervision</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{tradingAccounts.length}</p>
            </div>
          </div>
        </Panel>
      </div>

      <AdminOverviewOverlay
        open={overlayOpen}
        view={overlayView}
        onOpenChange={setOverlayOpen}
        activeTraders={adminSummary.activeTraders}
        connectedAccounts={adminSummary.connectedAccounts}
        openRiskEvents={adminSummary.openRiskEvents}
        monthlyRecurringRevenue={adminSummary.monthlyRecurringRevenue}
        equityCurve={equityCurve}
        trades={trades}
        tradingAccounts={tradingAccounts}
        traders={traders}
        riskEvents={riskEvents}
        riskRules={riskRules}
        crmNotes={crmNotes}
      />
    </WorkspacePage>
  );
}
