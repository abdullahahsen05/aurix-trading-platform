"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  DataTable,
  Panel,
  StatTile,
  StatusPill,
} from "@/components/app/WorkspaceUI";
import { EquityCurve } from "@/components/dashboard/EquityCurve";
import type {
  CrmNoteDto,
  EquityPoint,
  MoneyValue,
  RiskEventDto,
  RiskRuleDto,
  TradeDto,
  TraderAccountSummary,
  TraderProfileDto,
} from "@/lib/domain/types";
import { formatMoney, formatPercent } from "@/lib/utils/format";

export type AdminOverviewView = "OVERVIEW" | "ACCOUNTS" | "RISK_QUEUE" | "CRM";

type AdminOverviewOverlayProps = {
  open: boolean;
  view: AdminOverviewView | null;
  onOpenChange: (open: boolean) => void;
  activeTraders: number;
  connectedAccounts: number;
  openRiskEvents: number;
  monthlyRecurringRevenue: MoneyValue;
  equityCurve: EquityPoint[];
  trades: TradeDto[];
  tradingAccounts: TraderAccountSummary[];
  traders: TraderProfileDto[];
  riskEvents: RiskEventDto[];
  riskRules: RiskRuleDto[];
  crmNotes: CrmNoteDto[];
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

function SectionShell({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
        <h3 className="mt-2 text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function AdminOverviewOverlay({
  open,
  view,
  onOpenChange,
  activeTraders,
  connectedAccounts,
  openRiskEvents,
  monthlyRecurringRevenue,
  equityCurve,
  trades,
  tradingAccounts,
  traders,
  riskEvents,
  riskRules,
  crmNotes,
}: AdminOverviewOverlayProps) {
  const title =
    view === "ACCOUNTS"
      ? "Accounts"
      : view === "RISK_QUEUE"
        ? "Risk queue"
        : view === "CRM"
          ? "CRM"
          : "Overview";

  const description =
    view === "ACCOUNTS"
      ? "Broker-linked supervision details and account states."
      : view === "RISK_QUEUE"
        ? "Platform rules and active escalation signals."
        : view === "CRM"
          ? "Trader profiles and relationship notes in one place."
          : "Platform-wide oversight summary for admin review.";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/82 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[92vh] w-[96vw] max-w-7xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] border border-line bg-panel focus:outline-none">
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            transition={{ duration: 0.28 }}
            className="flex min-h-0 w-full flex-col"
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{description}</Dialog.Description>
            <div className="flex justify-end border-b border-line px-5 py-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close admin overlay"
                  className="grid h-10 w-10 place-items-center rounded-full border border-line bg-background text-muted transition hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {view === "OVERVIEW" ? (
                <div className="grid gap-4">
                  <Panel>
                    <SectionShell
                      eyebrow="Overview"
                      title="Platform overview"
                      description="A compact admin summary with the same visual language as the trader dashboard."
                    />
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <StatTile
                        label="Active traders"
                        value={activeTraders}
                        helper="Across all programs"
                      />
                      <StatTile
                        label="Connected accounts"
                        value={connectedAccounts}
                        helper="Broker-linked"
                        tone="lime"
                      />
                      <StatTile
                        label="Open risk events"
                        value={openRiskEvents}
                        helper="Needs admin review"
                        tone="accent"
                      />
                      <StatTile
                        label="MRR"
                        value={formatMoney(monthlyRecurringRevenue)}
                        helper="Subscription records"
                        tone="lime"
                      />
                    </div>
                  </Panel>

                  <div className="grid gap-4 xl:grid-cols-[0.68fr_0.32fr]">
                    <EquityCurve
                      data={equityCurve}
                      title="Platform oversight"
                      description="A calm trend line for operational health and account movement across the platform."
                    />
                    <Panel>
                      <SectionShell
                        eyebrow="Health"
                        title="Platform health"
                        description="A concise view of the current supervision posture."
                        action={<StatusPill tone="lime">Stable</StatusPill>}
                      />
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-line bg-background p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Closed trades</p>
                          <p className="mt-2 text-sm font-semibold text-foreground">
                            {trades.filter((trade) => trade.status === "CLOSED").length}
                          </p>
                        </div>
                        <div className="rounded-xl border border-line bg-background p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Watchlist</p>
                          <p className="mt-2 text-sm font-semibold text-foreground">{traders.length}</p>
                        </div>
                        <div className="rounded-xl border border-line bg-background p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Risk rules</p>
                          <p className="mt-2 text-sm font-semibold text-danger">{riskRules.length}</p>
                        </div>
                        <div className="rounded-xl border border-line bg-background p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Notes</p>
                          <p className="mt-2 text-sm font-semibold text-accent">{crmNotes.length}</p>
                        </div>
                      </div>
                    </Panel>
                  </div>
                </div>
              ) : null}

              {view === "ACCOUNTS" ? (
                <div className="grid gap-4 xl:grid-cols-[0.62fr_0.38fr]">
                  <Panel>
                    <SectionShell
                      eyebrow="Accounts"
                      title="Account supervision"
                      description="Broker-linked accounts and their current status."
                      action={<StatusPill tone="accent">{tradingAccounts.length} accounts</StatusPill>}
                    />
                    <div className="mt-4">
                      <DataTable
                        headers={["Account", "Broker", "Status", "Balance", "Equity", "Drawdown"]}
                        rows={tradingAccounts.map((account) => [
                          <span key="account" className="font-semibold text-foreground">
                            {account.accountName}
                          </span>,
                          account.brokerName,
                          <StatusPill key="status" tone={account.status === "CONNECTED" ? "lime" : "accent"}>
                            {account.status}
                          </StatusPill>,
                          formatMoney(account.balance),
                          <span key="equity" className="font-semibold text-accent-2">
                            {formatMoney(account.equity)}
                          </span>,
                          formatPercent(account.drawdownPercent),
                        ])}
                      />
                    </div>
                  </Panel>
                  <Panel>
                    <SectionShell
                      eyebrow="Snapshot"
                      title="Account notes"
                      description="A short view of the current supervision state."
                    />
                    <div className="mt-4 space-y-3">
                      {tradingAccounts.map((account) => (
                        <div key={account.accountId} className="rounded-xl border border-line bg-background p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-foreground">{account.accountName}</p>
                            <StatusPill tone={account.status === "CONNECTED" ? "lime" : "accent"}>
                              {account.status}
                            </StatusPill>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted">
                            {account.openTradeCount} open trades and {formatPercent(account.drawdownPercent)} drawdown.
                          </p>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              ) : null}

              {view === "RISK_QUEUE" ? (
                <div className="grid gap-4 xl:grid-cols-[0.58fr_0.42fr]">
                  <Panel>
                    <SectionShell
                      eyebrow="Risk queue"
                      title="Risk rules"
                      description="Platform guardrails and their current enabled state."
                      action={<StatusPill tone="accent">{riskRules.length} rules</StatusPill>}
                    />
                    <div className="mt-4">
                      <DataTable
                        headers={["Rule", "Scope", "Metric", "Threshold", "Severity", "Enabled"]}
                        rows={riskRules.map((rule) => [
                          <span key="name" className="font-semibold text-foreground">
                            {rule.name}
                          </span>,
                          rule.scope,
                          rule.metric,
                          rule.threshold,
                          <StatusPill
                            key="severity"
                            tone={
                              rule.severity === "CRITICAL"
                                ? "danger"
                                : rule.severity === "WARNING"
                                  ? "accent"
                                  : "muted"
                            }
                          >
                            {rule.severity}
                          </StatusPill>,
                          rule.enabled ? "Enabled" : "Disabled",
                        ])}
                      />
                    </div>
                  </Panel>
                  <Panel>
                    <SectionShell
                      eyebrow="Events"
                      title="Active risk events"
                      description="The queue that needs admin attention."
                      action={<StatusPill tone="accent">{riskEvents.length} open</StatusPill>}
                    />
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
                    </div>
                  </Panel>
                </div>
              ) : null}

              {view === "CRM" ? (
                <div className="grid gap-4 xl:grid-cols-[0.58fr_0.42fr]">
                  <Panel>
                    <SectionShell
                      eyebrow="CRM"
                      title="Trader watchlist"
                      description="Profiles, activity, and relationship context."
                      action={<StatusPill tone="muted">Live review</StatusPill>}
                    />
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
                    <SectionShell
                      eyebrow="Notes"
                      title="Recent CRM notes"
                      description="A compact timeline for follow-ups and support context."
                    />
                    <div className="mt-4 space-y-3">
                      {crmNotes.map((note) => (
                        <div key={note.id} className="rounded-xl border border-line bg-background p-4">
                          <p className="text-sm leading-6 text-foreground">{note.note}</p>
                          <p className="mt-2 text-xs text-muted">
                            {note.authorName} - {new Date(note.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              ) : null}
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
