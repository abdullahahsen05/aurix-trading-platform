 "use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  Panel,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { AdminOverviewOverlay, type AdminOverviewView } from "@/components/admin/AdminOverviewOverlay";
import { PerformanceRings } from "@/components/dashboard/PerformanceRings";
import { EquityCurve } from "@/components/dashboard/EquityCurve";
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

export default function AdminOverviewPage() {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayView, setOverlayView] = useState<AdminOverviewView>("OVERVIEW");

  const { data: adminSummary } = useQuery<AdminSummaryDto>({
    queryKey: ["admin-summary"],
    queryFn: async () => {
      const res = await fetch("/api/admin/summary");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load admin summary");
      return json.data;
    },
  });

  const { data: tradingAccounts = [] } = useQuery<TraderAccountSummary[]>({
    queryKey: ["admin-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/accounts");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load accounts");
      return json.data;
    },
  });

  const { data: traders = [] } = useQuery<TraderProfileDto[]>({
    queryKey: ["crm-traders"],
    queryFn: async () => {
      const res = await fetch("/api/crm/traders");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load traders");
      return json.data;
    },
  });

  const { data: trades = [] } = useQuery<TradeDto[]>({
    queryKey: ["trades"],
    queryFn: async () => {
      const res = await fetch("/api/trades");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load trades");
      return json.data;
    },
  });

  const { data: riskEvents = [] } = useQuery<RiskEventDto[]>({
    queryKey: ["risk-events"],
    queryFn: async () => {
      const res = await fetch("/api/risk/events");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load risk events");
      return json.data;
    },
  });

  const { data: riskRules = [] } = useQuery<RiskRuleDto[]>({
    queryKey: ["risk-rules"],
    queryFn: async () => {
      const res = await fetch("/api/risk/rules");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load risk rules");
      return json.data;
    },
  });

  const { data: crmNotes = [] } = useQuery<CrmNoteDto[]>({
    queryKey: ["crm-notes"],
    queryFn: async () => {
      const res = await fetch("/api/crm/notes");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load CRM notes");
      return json.data;
    },
  });

  // Use a flat equity curve from accounts for the platform-level trend
  const equityCurve: EquityPoint[] = tradingAccounts.map((account) => ({
    capturedAt: account.updatedAt,
    balance: account.balance.amount,
    equity: account.equity.amount,
  }));

  const activeTraders = adminSummary?.activeTraders ?? 0;
  const connectedAccounts = adminSummary?.connectedAccounts ?? 0;
  const openRiskEvents = adminSummary?.openRiskEvents ?? riskEvents.length;
  const monthlyRecurringRevenue = adminSummary?.monthlyRecurringRevenue ?? { amount: 0, currency: "USD" };

  const platformRings = [
    {
      label: "Active Traders",
      value: `${activeTraders}`,
      status: "Excellent",
      statusTone: "lime" as const,
      progress: Math.min(activeTraders / 150, 1),
      tone: "yellow" as const,
    },
    {
      label: "Connected Accounts",
      value: `${connectedAccounts}`,
      status: "Good",
      statusTone: "accent" as const,
      progress: Math.min(connectedAccounts / 250, 1),
      tone: "lime" as const,
    },
    {
      label: "Open Risk Events",
      value: `${openRiskEvents}`,
      status: openRiskEvents > 0 ? "Watch" : "Stable",
      statusTone: openRiskEvents > 0 ? ("danger" as const) : ("lime" as const),
      progress: Math.max(0.08, 1 - openRiskEvents / 10),
      tone: "yellow" as const,
    },
    {
      label: "MRR",
      value: formatMoney(monthlyRecurringRevenue),
      status: "Good",
      statusTone: "accent" as const,
      progress: Math.min(monthlyRecurringRevenue.amount / 20000, 1),
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
              {trades.filter((trade) => trade.status === "CLOSED").length} closed trades are represented in the platform snapshot, with
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
        activeTraders={activeTraders}
        connectedAccounts={connectedAccounts}
        openRiskEvents={openRiskEvents}
        monthlyRecurringRevenue={monthlyRecurringRevenue}
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
