"use client";

import { useState, type FormEvent } from "react";
import { Bell, ShieldAlert, SlidersHorizontal } from "lucide-react";
import {
  DataTable,
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

export default function AdminRiskPage() {
  const [message, setMessage] = useState("");

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("Admin risk rule saved and queued for supervision.");
  };

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="Risk configuration"
      description="Configure risk rules, threshold severity, warning signals, and future account restrictions."
      action={<PrimaryButton type="button">Create rule</PrimaryButton>}
    >
      <InlineStatusStrip
        items={[
          { label: "Rules", value: riskRules.length },
          {
            label: "Enabled",
            value: riskRules.filter((rule) => rule.enabled).length,
            tone: "lime",
          },
          {
            label: "Critical",
            value: riskRules.filter((rule) => rule.severity === "CRITICAL").length,
            tone: "danger",
          },
          { label: "Events", value: riskEvents.length, tone: "accent" },
        ]}
      />

      {message ? (
        <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {message}
        </div>
      ) : null}

      <div className="mt-5 grid items-stretch gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel className="flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Risk rules</h2>
              <p className="mt-1 text-sm text-muted">Editable rule set used by platform operations.</p>
            </div>
            <StatusPill tone="accent">Live monitor</StatusPill>
          </div>
          <div className="mt-4 flex-1">
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
                rule.enabled ? "Yes" : "No",
              ])}
            />
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel>
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Trading limit settings</h2>
                <p className="mt-1 text-sm leading-5 text-muted">Set the platform defaults before backend enforcement.</p>
              </div>
            </div>
            <form className="mt-6 grid gap-5" onSubmit={handleSave}>
              <div className="grid gap-4 xl:grid-cols-2">
                <TextField label="Daily loss limit" defaultValue="2500" />
                <TextField label="Max drawdown" defaultValue="5" />
                <SelectField label="Action" defaultValue="WARN">
                  <option value="WARN">Warn only</option>
                  <option value="LIMIT">Limit sizing</option>
                  <option value="RESTRICT">Restrict account</option>
                </SelectField>
                <SelectField label="Scope" defaultValue="PLATFORM">
                  <option value="PLATFORM">Platform</option>
                  <option value="ACCOUNT">Account</option>
                </SelectField>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-sm text-muted">These controls update the mock admin risk layer.</p>
                <div className="flex gap-3">
                  <GhostButton type="button">Reset</GhostButton>
                  <PrimaryButton type="submit">Save settings</PrimaryButton>
                </div>
              </div>
            </form>
          </Panel>

          <Panel className="flex flex-1 flex-col">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-danger/10 text-danger">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Platform moderation tools</h2>
                <p className="mt-1 text-sm text-muted">Quick actions for the moderation queue.</p>
              </div>
            </div>
            <div className="mt-5 grid flex-1 grid-cols-2 grid-rows-2 gap-3">
              <button className="flex flex-col justify-between rounded-2xl border border-line bg-background p-5 text-left transition hover:border-accent/40">
                <p className="text-sm font-semibold text-foreground">Suspend user</p>
                <p className="mt-2 text-xs leading-5 text-muted">Disable access for a trader or admin account.</p>
              </button>
              <button className="flex flex-col justify-between rounded-2xl border border-line bg-background p-5 text-left transition hover:border-accent/40">
                <p className="text-sm font-semibold text-foreground">Lock account</p>
                <p className="mt-2 text-xs leading-5 text-muted">Prevent new trade submissions until review.</p>
              </button>
              <button className="flex flex-col justify-between rounded-2xl border border-line bg-background p-5 text-left transition hover:border-accent/40">
                <p className="text-sm font-semibold text-foreground">Resolve warning</p>
                <p className="mt-2 text-xs leading-5 text-muted">Mark a risk event as reviewed and archived.</p>
              </button>
              <button className="flex flex-col justify-between rounded-2xl border border-line bg-background p-5 text-left transition hover:border-accent/40">
                <p className="text-sm font-semibold text-foreground">Recheck broker</p>
                <p className="mt-2 text-xs leading-5 text-muted">Run another mock supervision sync.</p>
              </button>
            </div>
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
            <StatusPill tone="accent">{tradingAccounts.length} accounts</StatusPill>
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
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
            <Bell className="h-4 w-4 text-accent" />
            Risk events are mirrored from the mock monitoring stream for now.
          </div>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
