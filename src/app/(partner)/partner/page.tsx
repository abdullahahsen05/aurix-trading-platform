"use client";

import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  EmptyState,
  InlineStatusStrip,
  Panel,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { formatMoney } from "@/lib/utils/format";
import type {
  PartnerSummaryDto,
  PartnerTraderDto,
  TraderRiskStatus,
} from "@/lib/partner/types";
import type { PartnerActivityDto, PartnerRiskEventDto } from "@/lib/services/partnerService";

const RISK_TONE: Record<TraderRiskStatus, "lime" | "accent" | "danger"> = {
  OK: "lime",
  AT_RISK: "accent",
  RESTRICTED: "danger",
};

const SEVERITY_TONE: Record<string, "lime" | "accent" | "danger"> = {
  INFO: "lime",
  WARNING: "accent",
  CRITICAL: "danger",
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data;
}

export default function PartnerOverviewPage() {
  const { data: summary, isLoading } = useQuery<PartnerSummaryDto>({
    queryKey: ["partner", "summary"],
    queryFn: () => getJson("/api/partner/summary"),
  });
  const { data: traders = [] } = useQuery<PartnerTraderDto[]>({
    queryKey: ["partner", "traders", "all"],
    queryFn: () => getJson("/api/partner/traders"),
  });
  const { data: riskEvents = [] } = useQuery<PartnerRiskEventDto[]>({
    queryKey: ["partner", "risk-events"],
    queryFn: () => getJson("/api/partner/risk-events"),
  });
  const { data: activities = [] } = useQuery<PartnerActivityDto[]>({
    queryKey: ["partner", "activities"],
    queryFn: () => getJson("/api/partner/activities"),
  });

  const hasTraders = traders.length > 0;

  return (
    <WorkspacePage
      eyebrow="Partner"
      title="Partner Overview"
      description="Monitor your assigned traders, activity, risk, and commissions."
    >
      <InlineStatusStrip
        items={[
          { label: "Assigned traders", value: isLoading ? "…" : summary?.assignedTraders ?? 0, tone: "accent" },
          { label: "Connected accounts", value: isLoading ? "…" : summary?.connectedAccounts ?? 0 },
          {
            label: "Team equity",
            value: summary ? formatMoney(summary.totalEquity) : "—",
            tone: "lime",
          },
          {
            label: "Aggregate PnL",
            value: summary ? formatMoney(summary.aggregateFloatingPnl) : "—",
            tone: (summary?.aggregateFloatingPnl.amount ?? 0) < 0 ? "danger" : "lime",
          },
          {
            label: "Open risk events",
            value: isLoading ? "…" : summary?.openRiskEvents ?? 0,
            tone: (summary?.openRiskEvents ?? 0) > 0 ? "danger" : undefined,
          },
          {
            label: "Pending commission",
            value: summary ? formatMoney(summary.pendingCommission) : "—",
            tone: "accent",
          },
        ]}
      />

      {summary?.referralCode ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Your referral code</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">{summary.referralCode}</p>
            <p className="mt-0.5 text-xs text-muted">
              Share as: <span className="font-mono">/register?partner={summary.referralCode}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(summary.referralCode ?? ""); }}
            className="shrink-0 rounded-xl border border-line bg-background px-3 py-2 text-xs font-semibold text-foreground hover:border-accent/40"
          >
            Copy
          </button>
        </div>
      ) : null}

      {!hasTraders && !isLoading ? (
        <div className="mt-5">
          <EmptyState
            title="No traders assigned yet"
            description="Once an admin assigns traders to you (or they sign up with your referral link), their performance, risk, and activity will appear here."
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <div className="space-y-5">
            <Panel>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-foreground">Trader watchlist</h2>
                {traders.length > 12 ? <span className="text-xs text-muted">Showing 12 of {traders.length}</span> : null}
              </div>
              {traders.length === 0 ? (
                <p className="text-sm text-muted">No traders to display.</p>
              ) : (
                <DataTable
                  headers={["Trader", "Accounts", "Team equity", "Risk"]}
                  rows={traders.slice(0, 12).map((t) => [
                    <div key="n" className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                      <p className="truncate text-xs text-muted">{t.email}</p>
                    </div>,
                    <span key="a">
                      {t.connectedAccounts}/{t.accountCount}
                    </span>,
                    <span key="e">{formatMoney(t.totalEquity)}</span>,
                    <StatusPill key="r" tone={RISK_TONE[t.riskStatus]}>
                      {t.riskStatus}
                    </StatusPill>,
                  ])}
                />
              )}
            </Panel>

            <Panel>
              <h2 className="mb-4 text-lg font-semibold text-foreground">Recent activity</h2>
              {activities.length === 0 ? (
                <p className="text-sm text-muted">No activity recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {activities.slice(0, 10).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-background px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{a.traderName}</p>
                        <p className="truncate text-xs text-muted">{a.description}</p>
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                        {new Date(a.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Risk queue</h2>
            {riskEvents.length === 0 ? (
              <p className="text-sm text-muted">No open risk events for your traders.</p>
            ) : (
              <div className="space-y-2">
                {riskEvents.slice(0, 12).map((e) => (
                  <div key={e.id} className="rounded-xl border border-line bg-background px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{e.traderName}</p>
                      <StatusPill tone={SEVERITY_TONE[e.severity] ?? "muted"}>{e.severity}</StatusPill>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted">{e.message}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </WorkspacePage>
  );
}
