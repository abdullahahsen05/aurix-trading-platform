"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Search, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { DirectorySearchOverlay } from "@/components/app/DirectorySearchOverlay";
import {
  GhostButton,
  FilterChipRow,
  InlineStatusStrip,
  Panel,
  PageActionGroup,
  PrimaryButton,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { SelectField } from "@/components/app/FormFields";

type ApiAccountRecord = {
  id: string;
  user_id: string;
  account_name: string;
  broker_name: string;
  status: string;
  currency: string;
  created_at: string;
};

type AccountRecord = {
  accountId: string;
  accountName: string;
  brokerName: string;
  status: "CONNECTED" | "SYNCING" | "DISCONNECTED" | "RESTRICTED" | "PENDING";
  updatedAt: string;
  openTradeCount: number;
};

function toAccountRecord(raw: ApiAccountRecord): AccountRecord {
  return {
    accountId: raw.id,
    accountName: raw.account_name,
    brokerName: raw.broker_name,
    status: (raw.status as AccountRecord["status"]) ?? "PENDING",
    updatedAt: raw.created_at,
    openTradeCount: 0,
  };
}

export default function AdminAccountsPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CONNECTED" | "SYNCING" | "DISCONNECTED" | "RESTRICTED">(
    "ALL",
  );

  const { data: rawAccounts = [], isLoading } = useQuery<ApiAccountRecord[]>({
    queryKey: ["admin-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/accounts");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load accounts");
      return json.data;
    },
  });

  const accounts: AccountRecord[] = useMemo(() => rawAccounts.map(toAccountRecord), [rawAccounts]);
  const filteredAccounts = accounts.filter((account) => statusFilter === "ALL" || account.status === statusFilter);
  const effectiveSelectedId = selectedId || accounts[0]?.accountId || "";
  const selectedAccount =
    filteredAccounts.find((account) => account.accountId === effectiveSelectedId) ?? filteredAccounts[0] ?? accounts[0];

  const handleVerify = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVerifyOpen(false);
    setSuccessMessage("Selected account verification queued in supervision.");
  };

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="Account supervision"
      description="Overlay-first directory for broker-linked accounts, drawdown review, and queue-based verification."
      action={
        <PageActionGroup>
          <GhostButton type="button" onClick={() => setSearchOpen(true)}>
            <Search className="mr-2 inline-block h-4 w-4" />
            Search
          </GhostButton>
          <Dialog.Root open={verifyOpen} onOpenChange={setVerifyOpen}>
            <Dialog.Trigger asChild>
              <PrimaryButton type="button">
                <CheckCircle2 className="mr-2 inline-block h-4 w-4" />
                Verify selected
              </PrimaryButton>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
                <Dialog.Title className="text-xl font-semibold text-foreground">Verify accounts</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                  Queue broker connection verification for the selected trading accounts.
                </Dialog.Description>
                <form className="mt-6 grid gap-4" onSubmit={handleVerify}>
                  <SelectField label="Verification scope" defaultValue="ALL">
                    <option value="ALL">All visible accounts</option>
                    <option value="CONNECTED">Connected only</option>
                    <option value="SYNCING">Syncing only</option>
                  </SelectField>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <p className="text-sm text-muted">Verification updates the queue and clears no data.</p>
                    <div className="flex gap-3">
                      <Dialog.Close asChild>
                        <GhostButton type="button">Cancel</GhostButton>
                      </Dialog.Close>
                      <PrimaryButton type="submit">Queue verification</PrimaryButton>
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
          { label: "Accounts", value: isLoading ? "..." : accounts.length },
          {
            label: "Connected",
            value: accounts.filter((account) => account.status === "CONNECTED").length,
            tone: "lime",
          },
          {
            label: "Syncing",
            value: accounts.filter((account) => account.status === "SYNCING").length,
            tone: "accent",
          },
          { label: "Restricted", value: accounts.filter((a) => a.status === "RESTRICTED").length },
        ]}
      />

      <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
        <FilterChipRow
          chips={[
            {
              label: `All (${accounts.length})`,
              active: statusFilter === "ALL",
              onClick: () => {
                setStatusFilter("ALL");
                setSelectedId(accounts[0]?.accountId ?? "");
              },
            },
            {
              label: `Connected (${accounts.filter((account) => account.status === "CONNECTED").length})`,
              active: statusFilter === "CONNECTED",
              onClick: () => {
                setStatusFilter("CONNECTED");
                setSelectedId(accounts.find((account) => account.status === "CONNECTED")?.accountId ?? accounts[0]?.accountId ?? "");
              },
            },
            {
              label: `Syncing (${accounts.filter((account) => account.status === "SYNCING").length})`,
              active: statusFilter === "SYNCING",
              onClick: () => {
                setStatusFilter("SYNCING");
                setSelectedId(accounts.find((account) => account.status === "SYNCING")?.accountId ?? accounts[0]?.accountId ?? "");
              },
            },
            {
              label: `Disconnected (${accounts.filter((account) => account.status === "DISCONNECTED").length})`,
              active: statusFilter === "DISCONNECTED",
              onClick: () => {
                setStatusFilter("DISCONNECTED");
                setSelectedId(accounts.find((account) => account.status === "DISCONNECTED")?.accountId ?? accounts[0]?.accountId ?? "");
              },
            },
            {
              label: `Restricted (${accounts.filter((account) => account.status === "RESTRICTED").length})`,
              active: statusFilter === "RESTRICTED",
              onClick: () => {
                setStatusFilter("RESTRICTED");
                setSelectedId(accounts.find((account) => account.status === "RESTRICTED")?.accountId ?? accounts[0]?.accountId ?? "");
              },
            },
          ]}
        />
      </div>

      {successMessage ? (
        <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {successMessage}
        </div>
      ) : null}

      {accountMessage ? (
        <div className="mt-3 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {accountMessage}
        </div>
      ) : null}

      {selectedAccount ? (
        <div className="mt-5">
          <Panel className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Selected account</p>
                <h2 className="mt-2 text-lg font-semibold text-foreground">{selectedAccount.accountName}</h2>
                <p className="mt-1 text-sm text-muted">{selectedAccount.brokerName}</p>
              </div>
              <StatusPill tone={selectedAccount.status === "CONNECTED" ? "lime" : "accent"}>
                {selectedAccount.status}
              </StatusPill>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Account ID</p>
                <p className="mt-1 text-sm font-semibold text-foreground truncate">{selectedAccount.accountId}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Status</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{selectedAccount.status}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Open trades</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{selectedAccount.openTradeCount}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Created</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{new Date(selectedAccount.updatedAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <GhostButton
                type="button"
                onClick={() => setAccountMessage(`${selectedAccount.accountName} queued for removal from supervision.`)}
              >
                Remove from queue
              </GhostButton>
            </div>
          </Panel>
        </div>
      ) : isLoading ? (
        <div className="mt-5 rounded-2xl border border-line bg-panel p-8 text-center text-sm text-muted">
          Loading accounts...
        </div>
      ) : null}

      <DirectorySearchOverlay<AccountRecord>
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Find accounts"
        description="Search and filters stay in the overlay so the supervision page remains minimal."
        items={accounts}
        selectedId={selectedAccount?.accountId ?? ""}
        onSelect={(id) => {
          setSelectedId(id);
          setSearchOpen(false);
        }}
        searchLabel="Search accounts"
        searchPlaceholder="Search by account or broker"
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "ALL", label: "All statuses" },
              { value: "CONNECTED", label: "Connected" },
              { value: "SYNCING", label: "Syncing" },
              { value: "DISCONNECTED", label: "Disconnected" },
              { value: "RESTRICTED", label: "Restricted" },
            ],
          },
        ]}
        emptyTitle="No accounts match"
        emptyDescription="Adjust the search term or status filter."
        getId={(account) => account.accountId}
        matches={(account, state) => {
          const search = state.query.trim().toLowerCase();
          const matchesQuery =
            search.length === 0 ||
            account.accountName.toLowerCase().includes(search) ||
            account.brokerName.toLowerCase().includes(search);
          const matchesStatus = state.filters.status === "ALL" || account.status === state.filters.status;
          return matchesQuery && matchesStatus;
        }}
        renderRow={(account) => (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{account.accountName}</p>
                <p className="mt-1 truncate text-xs text-muted">{account.brokerName}</p>
              </div>
              <StatusPill tone={account.status === "CONNECTED" ? "lime" : "accent"}>{account.status}</StatusPill>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-muted">
                {new Date(account.updatedAt).toLocaleDateString()}
              </span>
              <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-muted">
                {account.openTradeCount} open trades
              </span>
            </div>
          </>
        )}
        renderPreview={(account) => (
          <Panel className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Account preview</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{account.accountName}</h3>
                <p className="mt-1 text-sm text-muted">{account.brokerName}</p>
              </div>
              <StatusPill tone={account.status === "CONNECTED" ? "lime" : "accent"}>{account.status}</StatusPill>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Account ID</p>
                <p className="mt-1 text-sm font-semibold text-foreground truncate">{account.accountId}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Status</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{account.status}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Open trades</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{account.openTradeCount}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Created</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{new Date(account.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          </Panel>
        )}
      />
    </WorkspacePage>
  );
}
