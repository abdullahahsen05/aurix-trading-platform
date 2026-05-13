"use client";

import { useState, type FormEvent } from "react";
import {
  DataTable,
  EmptyState,
  GhostButton,
  InlineStatusStrip,
  Panel,
  PrimaryButton,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { SelectField, TextField } from "@/components/app/FormFields";
import { riskEvents, riskRules, tradingAccounts } from "@/lib/data/mockData";
import { formatMoney, formatPercent } from "@/lib/utils/format";

function RiskBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: "accent" | "lime" | "danger" }) {
  return (
    <div className="rounded-2xl border border-line bg-background p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <span className={`text-sm font-semibold ${tone === "danger" ? "text-danger" : tone === "lime" ? "text-accent-2" : "text-accent"}`}>
          {formatPercent(value)}
        </span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full border border-line bg-panel">
        <div
          className={`h-full rounded-full ${
            tone === "danger" ? "bg-danger" : tone === "lime" ? "bg-accent-2" : "bg-accent"
          }`}
          style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">Limit {formatPercent(max)}</p>
    </div>
  );
}

export default function RiskPage() {
  const [submitted, setSubmitted] = useState("");

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted("Risk limits saved. The mock monitor updated the live rule set.");
  };

  const dailyLoss = 108.29;
  const dailyLossLimit = 1250;
  const maxDrawdown = Math.max(...tradingAccounts.map((account) => account.drawdownPercent));
  const openEvents = riskEvents;

  return (
    <WorkspacePage
      eyebrow="Risk"
      title="Risk rule monitoring"
      description="Daily loss, drawdown, open trade concentration, warning history, and account restriction signals."
      action={<PrimaryButton type="button">Create rule</PrimaryButton>}
    >
      <InlineStatusStrip
        items={[
          {
            label: "Active rules",
            value: riskRules.filter((rule) => rule.enabled).length,
            helper: "Platform + account rules",
          },
          { label: "Open events", value: riskEvents.length, helper: "Needs review", tone: "accent" },
          {
            label: "Highest drawdown",
            value: formatPercent(maxDrawdown),
            tone: maxDrawdown >= 5 ? "danger" : "accent",
          },
          { label: "Restricted", value: "0", helper: "No account locked", tone: "lime" },
        ]}
      />

      <div className="mt-5 flex flex-wrap gap-2">
        <StatusPill tone="danger">Critical</StatusPill>
        <StatusPill tone="accent">Warning</StatusPill>
        <StatusPill tone="lime">Stable</StatusPill>
        <StatusPill tone="muted">Legend</StatusPill>
      </div>

      {submitted ? (
        <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {submitted}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.35fr_0.65fr]">
        <div className="grid gap-4">
          <RiskBar label="Daily loss monitor" value={(dailyLoss / dailyLossLimit) * 100} max={100} tone="accent" />
          <RiskBar label="Max drawdown protection" value={maxDrawdown} max={8} tone={maxDrawdown >= 5 ? "danger" : "lime"} />
          <div className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Warning notifications</h3>
                <p className="mt-1 text-xs text-muted">Real-time mock alerts waiting for review</p>
              </div>
              <StatusPill tone="accent">Live</StatusPill>
            </div>
            <div className="mt-4 space-y-3">
              {openEvents.length === 0 ? (
                <EmptyState
                  title="No active warnings"
                  description="The risk desk is currently clear."
                />
              ) : (
                openEvents.map((event) => (
                  <div key={event.id} className="rounded-xl border border-line bg-background p-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-semibold text-foreground">{event.ruleName}</p>
                      <StatusPill tone="accent">{event.severity}</StatusPill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">{event.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">Rule set</h2>
              <StatusPill tone="lime">{riskRules.length} rules</StatusPill>
            </div>
            <div className="mt-4">
              <DataTable
                headers={["Rule", "Metric", "Threshold", "Severity", "State"]}
                rows={riskRules.map((rule) => [
                  <span key="name" className="font-semibold text-foreground">
                    {rule.name}
                  </span>,
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
            <h2 className="text-lg font-semibold text-foreground">Trading limit settings</h2>
            <form className="mt-5 grid gap-4" onSubmit={handleSave}>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="Daily loss limit" defaultValue="1250" />
                <TextField label="Max drawdown limit" defaultValue="5" />
                <SelectField label="Concentration rule" defaultValue="OPEN_TRADES">
                  <option value="OPEN_TRADES">Open trades</option>
                  <option value="DAILY_LOSS">Daily loss</option>
                  <option value="MAX_DRAWDOWN">Max drawdown</option>
                </SelectField>
                <SelectField label="Action" defaultValue="WARN">
                  <option value="WARN">Warn only</option>
                  <option value="LIMIT">Limit position sizing</option>
                  <option value="RESTRICT">Restrict account</option>
                </SelectField>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-sm text-muted">
                  Account limits apply to the mock risk service until backend enforcement is wired.
                </p>
                <div className="flex gap-3">
                  <GhostButton type="button">Reset</GhostButton>
                  <PrimaryButton type="submit">Save limits</PrimaryButton>
                </div>
              </div>
            </form>
          </Panel>
        </div>
      </div>

      <div className="mt-5">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Rule-based account monitoring</h2>
              <p className="mt-1 text-sm text-muted">Accounts are shown with the current mock risk posture.</p>
            </div>
            <StatusPill tone="accent">2 accounts</StatusPill>
          </div>
          <div className="mt-4">
            <DataTable
              headers={["Account", "Broker", "Status", "Balance", "Equity", "Drawdown", "Risk state"]}
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
                account.drawdownPercent >= 5 ? "Watch" : "Normal",
              ])}
            />
          </div>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
