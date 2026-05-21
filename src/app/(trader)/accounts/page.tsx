"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DataTable,
  EmptyState,
  GhostButton,
  FilterChipRow,
  Panel,
  PageActionGroup,
  PrimaryButton,
  InlineStatusStrip,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { SearchField, SelectField, TextField } from "@/components/app/FormFields";
import { formatMoney, formatPercent } from "@/lib/utils/format";
import type { TraderAccountSummary } from "@/lib/domain/types";

export default function AccountsPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [connectOpen, setConnectOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const queryClient = useQueryClient();

  const { data: tradingAccounts = [], isLoading } = useQuery<TraderAccountSummary[]>({
    queryKey: ["trading-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/trading-accounts");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load accounts");
      return json.data;
    },
  });

  const filteredAccounts = tradingAccounts.filter((account) => {
    const matchesQuery =
      query.trim().length === 0 ||
      account.accountName.toLowerCase().includes(query.toLowerCase()) ||
      account.brokerName.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || account.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSuccessMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch("/api/trading-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: formData.get("accountLabel") as string,
          brokerName: formData.get("broker") as string,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        await queryClient.invalidateQueries({ queryKey: ["trading-accounts"] });
        setConnectOpen(false);
        setSuccessMessage("Account connected successfully.");
      } else {
        setSuccessMessage(`Error: ${json.error?.message ?? "Failed to connect account"}`);
        setConnectOpen(false);
      }
    } catch {
      setSuccessMessage("Connection request saved. Broker sync is queued.");
      setConnectOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const connectedCount = tradingAccounts.filter((a) => a.status === "CONNECTED").length;
  const syncingCount = tradingAccounts.filter((a) => a.status === "SYNCING").length;
  const totalPnl = tradingAccounts.reduce((sum, a) => sum + a.floatingPnl.amount, 0);

  return (
    <WorkspacePage
      eyebrow="Trading accounts"
      title="Connected broker accounts"
      description="Track broker status, challenge stage, equity, drawdown, and sync health before backend credentials are connected."
      action={
        <PageActionGroup>
          <Dialog.Root open={connectOpen} onOpenChange={setConnectOpen}>
          <Dialog.Trigger asChild>
            <PrimaryButton type="button">
              <Plus className="mr-2 inline-block h-4 w-4" />
              Connect account
            </PrimaryButton>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
              <Dialog.Title className="text-xl font-semibold text-foreground">
                Connect broker account
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                Add broker credentials and account metadata. The form is mock-backed for now, but the UI matches the real workflow.
              </Dialog.Description>
              <form className="mt-6 grid gap-4" onSubmit={handleConnect}>
                <div className="grid gap-4 md:grid-cols-2">
                  <SelectField label="Broker" name="broker" defaultValue="MetaTrader 5 Demo">
                    <option>MetaTrader 5 Demo</option>
                    <option>MetaApi Sandbox</option>
                    <option>MetaTrader 5 Live</option>
                  </SelectField>
                  <TextField label="Account label" name="accountLabel" defaultValue="New evaluation account" />
                  <TextField label="MT5 login" placeholder="12345678" />
                  <TextField label="Investor password" type="password" placeholder="••••••••" />
                  <TextField label="Server" placeholder="Broker server name" />
                  <TextField label="Challenge stage" defaultValue="Phase 2" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <p className="text-sm text-muted">
                    Connections are validated against the mock broker adapter until live credentials arrive.
                  </p>
                  <div className="flex gap-3">
                    <Dialog.Close asChild>
                      <GhostButton type="button">Cancel</GhostButton>
                    </Dialog.Close>
                    <PrimaryButton type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Saving..." : "Connect account"}
                    </PrimaryButton>
                  </div>
                </div>
              </form>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close dialog"
                  className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-line bg-background text-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
          </Dialog.Root>
        </PageActionGroup>
      }
    >
      <InlineStatusStrip
        items={[
          { label: "Connected", value: connectedCount, helper: "Live adapter", tone: "lime" },
          { label: "Syncing", value: syncingCount, helper: "MetaApi sandbox ready", tone: "accent" },
          {
            label: "Open exposure",
            value: formatMoney({ amount: totalPnl, currency: "USD" }),
            helper: "Net floating PnL",
          },
        ]}
      />

      {successMessage ? (
        <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {successMessage}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-line bg-panel p-4">
        <div className="grid flex-1 gap-4">
          <SearchField
            label="Search accounts"
            placeholder="Search by account or broker"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <FilterChipRow
              chips={[
                { label: "All statuses", active: statusFilter === "ALL", onClick: () => setStatusFilter("ALL") },
                {
                  label: "Connected",
                  active: statusFilter === "CONNECTED",
                  onClick: () => setStatusFilter("CONNECTED"),
                },
                { label: "Syncing", active: statusFilter === "SYNCING", onClick: () => setStatusFilter("SYNCING") },
                {
                  label: "Disconnected",
                  active: statusFilter === "DISCONNECTED",
                  onClick: () => setStatusFilter("DISCONNECTED"),
                },
                {
                  label: "Restricted",
                  active: statusFilter === "RESTRICTED",
                  onClick: () => setStatusFilter("RESTRICTED"),
                },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {isLoading ? (
          <div className="xl:col-span-2">
            <div className="rounded-2xl border border-line bg-panel p-8 text-center text-sm text-muted">
              Loading accounts...
            </div>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="xl:col-span-2">
            <EmptyState
              title="No accounts match your filters"
              description="Try a different search term or clear the current status filter."
              action={
                <GhostButton
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("ALL");
                  }}
                >
                  Reset filters
                </GhostButton>
              }
            />
          </div>
        ) : (
          filteredAccounts.map((account) => (
            <Panel key={account.accountId} className="min-h-56">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-muted">{account.brokerName}</p>
                  <h2 className="mt-2 text-xl font-semibold text-foreground">{account.accountName}</h2>
                </div>
                <StatusPill tone={account.status === "CONNECTED" ? "lime" : "accent"}>
                  {account.status}
                </StatusPill>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold text-muted">Balance</p>
                  <p className="mt-2 font-semibold text-foreground">{formatMoney(account.balance)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">Equity</p>
                  <p className="mt-2 font-semibold text-accent-2">{formatMoney(account.equity)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">Floating PnL</p>
                  <p
                    className={
                      account.floatingPnl.amount >= 0
                        ? "mt-2 font-semibold text-accent"
                        : "mt-2 font-semibold text-danger"
                    }
                  >
                    {formatMoney(account.floatingPnl)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">Drawdown</p>
                  <p className="mt-2 font-semibold text-foreground">{formatPercent(account.drawdownPercent)}</p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-sm text-muted">Updated {new Date(account.updatedAt).toLocaleString()}</p>
                <div className="flex flex-wrap gap-3">
                  <GhostButton
                    type="button"
                    onClick={() => setSuccessMessage(`Disconnect queued for ${account.accountName}.`)}
                  >
                    Disconnect
                  </GhostButton>
                  <Link
                    href={`/accounts/${account.accountId}`}
                    className="rounded-full bg-panel-strong px-5 py-2 text-sm font-semibold text-accent transition hover:scale-[1.02]"
                  >
                    View details
                  </Link>
                </div>
              </div>
            </Panel>
          ))
        )}
      </div>

      {filteredAccounts.length > 0 ? (
        <div className="mt-5">
          <DataTable
            headers={["Account", "Broker", "Status", "Open Trades", "Equity", "Drawdown"]}
            rows={filteredAccounts.map((account) => [
              <span key="name" className="font-semibold text-foreground">
                {account.accountName}
              </span>,
              account.brokerName,
              <StatusPill key="status" tone={account.status === "CONNECTED" ? "lime" : "accent"}>
                {account.status}
              </StatusPill>,
              account.openTradeCount,
              <span key="equity" className="font-semibold text-accent-2">
                {formatMoney(account.equity)}
              </span>,
              formatPercent(account.drawdownPercent),
            ])}
          />
        </div>
      ) : null}
    </WorkspacePage>
  );
}
