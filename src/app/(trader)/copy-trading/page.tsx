"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Repeat, ShieldCheck as Lock, X } from "lucide-react";
import { BillingCheckoutModal } from "@/components/app/BillingCheckoutModal";
import { PlatformSubscriptionLocked } from "@/components/app/PlatformSubscriptionLocked";
import { SelectField } from "@/components/app/FormFields";
import {
  DataTable,
  EmptyState,
  FilterChipRow,
  GhostButton,
  Panel,
  PrimaryButton,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { EMPTY_PLATFORM_SUBSCRIPTION_ACCESS, useTraderAccessSummary } from "@/hooks/useTraderAccessSummary";
import type { CopyFollowerDto, CopyLogDto } from "@/lib/copy/types";
import type { TraderAccountSummary } from "@/lib/domain/types";
import type { TraderStrategyDto } from "@/lib/services/copyTradingService";
import type { CopyEntitlementDto, UserBillingSummaryDto } from "@/lib/services/billingService";

type StrategyDto = TraderStrategyDto;
type CopyTier = "NORMAL" | "PREMIUM";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data;
}

const STATUS_TONE: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  ACTIVE: "lime",
  PAUSED: "accent",
  PENDING: "accent",
  PENDING_PAYMENT: "muted",
  PENDING_APPROVAL: "accent",
  REVOKED: "muted",
  DISABLED: "muted",
  EXPIRED: "danger",
  CANCELLED: "muted",
  REFUNDED: "muted",
  SUCCESS: "lime",
  SKIPPED: "muted",
  FAILED: "danger",
};

const COPY_CHECKOUT_ALLOWED_STATUSES = new Set([
  "NONE",
  "EXPIRED",
  "CANCELLED",
  "FAILED",
  "REFUNDED",
]);

function getCopyTierLabel(tier: string) {
  return tier === "PREMIUM" ? "Ultra Fast" : "Normal";
}

function createEmptyCopyAccess(tradingAccountId: string): CopyEntitlementDto {
  return {
    id: "",
    tier: "NORMAL",
    tradingAccountId,
    status: "NONE",
    currentPeriodEnd: null,
    approvedAt: null,
    orderId: null,
    message: "",
  };
}

function describeCopyAccess(access: CopyEntitlementDto) {
  switch (access.status) {
    case "ACTIVE":
      return "Ready for copy trading on this account.";
    case "PENDING_APPROVAL":
      return "Payment received - pending admin approval.";
    case "PENDING_PAYMENT":
      return "Payment pending. Complete checkout to continue.";
    case "EXPIRED":
      return "Subscription expired - renew to continue.";
    case "FAILED":
      return "Previous payment failed - you can try again.";
    case "CANCELLED":
      return "Previous checkout was cancelled.";
    case "REFUNDED":
      return "Previous payment was refunded.";
    default:
      return "Choose a copy tier for this account.";
  }
}

function getCopyCheckoutProduct(tier: CopyTier) {
  return tier === "PREMIUM"
    ? {
        code: "COPY_ULTRA_FAST",
        name: "Copy Trading - Ultra Fast",
        amount: 15,
        currency: "USD",
        billingInterval: "MONTHLY",
        description: "Lowest latency copy execution. Renews monthly from approval date.",
      }
    : {
        code: "COPY_NORMAL",
        name: "Copy Trading - Normal",
        amount: 10,
        currency: "USD",
        billingInterval: "MONTHLY",
        description: "Standard copy speed for most strategies. Renews monthly from approval date.",
      };
}

export default function CopyTradingPage() {
  const { data: accessSummary, isLoading: accessLoading } = useTraderAccessSummary();
  const platformAccess = accessSummary?.platformSubscription ?? EMPTY_PLATFORM_SUBSCRIPTION_ACCESS;

  if (accessLoading && !accessSummary) {
    return (
      <WorkspacePage eyebrow="Copy Trading" title="Copy Trading" description="Loading your platform access status.">
        <Panel>
          <p className="text-sm text-muted">Loading...</p>
        </Panel>
      </WorkspacePage>
    );
  }

  if (platformAccess.status !== "ACTIVE") {
    return (
      <WorkspacePage
        eyebrow="Copy Trading"
        title="Copy Trading"
        description="Activate your platform subscription before enabling account-level copy trading access."
      >
        <PlatformSubscriptionLocked
          access={platformAccess}
          description="Copy trading requires an active WSA Global platform subscription first. After activation, you can choose a Normal or Ultra Fast copy tier for each trading account."
        />
      </WorkspacePage>
    );
  }

  return <CopyTradingContent initialBillingSummary={accessSummary} />;
}

function CopyTradingContent({
  initialBillingSummary,
}: {
  initialBillingSummary?: UserBillingSummaryDto;
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copyTierModal, setCopyTierModal] = useState<{ tier: CopyTier; accountId: string } | null>(null);
  const [followStrategy, setFollowStrategy] = useState<StrategyDto | null>(null);
  const [followAccountId, setFollowAccountId] = useState("");
  const [consent, setConsent] = useState(false);
  const [revokeSubId, setRevokeSubId] = useState<string | null>(null);
  const [logStatusFilter, setLogStatusFilter] = useState<"ALL" | "SUCCESS" | "SKIPPED" | "FAILED">("ALL");

  const { data: billingSummary } = useQuery<UserBillingSummaryDto>({
    queryKey: ["billing-me"],
    queryFn: () => getJson("/api/billing/me"),
    staleTime: 60_000,
    initialData: initialBillingSummary,
  });
  const { data: strategies = [], isLoading } = useQuery<StrategyDto[]>({
    queryKey: ["copy-strategies"],
    queryFn: () => getJson("/api/copy/strategies"),
  });
  const { data: subscriptions = [] } = useQuery<CopyFollowerDto[]>({
    queryKey: ["copy-my-subscriptions"],
    queryFn: () => getJson("/api/copy/my-subscriptions"),
  });
  const { data: accounts = [] } = useQuery<TraderAccountSummary[]>({
    queryKey: ["trading-accounts"],
    queryFn: () => getJson("/api/trading-accounts"),
  });
  const { data: logs = [] } = useQuery<CopyLogDto[]>({
    queryKey: ["copy-my-logs"],
    queryFn: () => getJson("/api/copy/logs"),
  });

  const copyEntitlements = billingSummary?.copyEntitlements ?? [];
  const copyAccessByAccount = new Map(
    copyEntitlements
      .filter((entry) => entry.tradingAccountId)
      .map((entry) => [entry.tradingAccountId as string, entry] as const),
  );
  const accountAccessCards = accounts.map((account) => ({
    account,
    access: copyAccessByAccount.get(account.accountId) ?? createEmptyCopyAccess(account.accountId),
  }));
  const activeCopyAccounts = accountAccessCards.filter(({ access }) => access.status === "ACTIVE");
  const activeCopyAccountOptions = activeCopyAccounts.map(({ account }) => account);
  const hasActiveCopyAccess = activeCopyAccounts.length > 0;
  const hasPendingCopyAccess = accountAccessCards.some(
    ({ access }) => access.status === "PENDING_APPROVAL" || access.status === "PENDING_PAYMENT",
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["billing-me"] });
    queryClient.invalidateQueries({ queryKey: ["copy-my-subscriptions"] });
    queryClient.invalidateQueries({ queryKey: ["copy-my-logs"] });
  }

  function openFollowDialog(strategy: StrategyDto) {
    if (!hasActiveCopyAccess) return;
    setFollowStrategy(strategy);
    setFollowAccountId((current) =>
      activeCopyAccountOptions.some((account) => account.accountId === current)
        ? current
        : activeCopyAccountOptions[0]?.accountId ?? "",
    );
    setConsent(false);
    setNotice(null);
  }

  const follow = useMutation({
    mutationFn: async () => {
      if (!followStrategy) throw new Error("No strategy selected");
      const res = await fetch(`/api/copy/strategies/${followStrategy.id}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followerAccountId: followAccountId, consentAccepted: consent }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to follow");
      return json.data;
    },
    onSuccess: () => {
      invalidate();
      setNotice({ type: "success", text: "You are now following this strategy." });
      setFollowStrategy(null);
      setFollowAccountId("");
      setConsent(false);
    },
    onError: (err: Error) => setNotice({ type: "error", text: err.message }),
  });

  const updateSub = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "ACTIVE" | "PAUSED" | "REVOKED" }) => {
      const res = await fetch(`/api/copy/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update");
      return json.data;
    },
    onSuccess: () => {
      invalidate();
      setNotice({ type: "success", text: "Subscription updated." });
    },
    onError: (err: Error) => setNotice({ type: "error", text: err.message }),
  });

  return (
    <>
      <WorkspacePage
        eyebrow="Copy Trading"
        title="Copy Trading"
        description="Follow a master strategy on one of your connected accounts. You control pause and stop at any time."
      >
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Trading involves substantial risk of loss. Copy trading is <strong>not a guarantee of profit</strong>.
            Copied trades are scaled to your account but can still lose money. You can pause or stop following at any time.
          </p>
        </div>

        <Panel className="mb-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Lock className="h-4 w-4 text-accent" />
                Per-account copy access
              </div>
              <p className="text-xs text-muted">
                Copy trading is billed per connected account after your platform subscription is active.
                Normal is $10/month per account and Ultra Fast is $15/month per account.
              </p>
            </div>
            {hasActiveCopyAccess ? (
              <div className="flex flex-wrap gap-2">
                {activeCopyAccounts.map(({ account, access }) => (
                  <span
                    key={account.accountId}
                    className="rounded-full border border-lime/30 bg-lime/10 px-3 py-1 text-xs font-semibold text-lime"
                  >
                    {account.accountName}: {getCopyTierLabel(access.tier)}
                    {access.currentPeriodEnd
                      ? ` · renews ${new Date(access.currentPeriodEnd).toLocaleDateString()}`
                      : ""}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {hasPendingCopyAccess && !hasActiveCopyAccess ? (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Payment received - at least one copy-trading account is pending approval.
                Following strategies will unlock on that account after admin review.
              </p>
            </div>
          ) : null}

          {accounts.length === 0 ? (
            <p className="text-sm text-muted">
              Connect a trading account first, then choose a copy tier for the specific account you want to use.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {accountAccessCards.map(({ account, access }) => {
                const canPurchase = COPY_CHECKOUT_ALLOWED_STATUSES.has(access.status);

                return (
                  <div key={account.accountId} className="rounded-2xl border border-line bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{account.accountName}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {account.brokerName} · {account.status}
                        </p>
                      </div>
                      <StatusPill tone={STATUS_TONE[access.status] ?? "muted"}>
                        {access.status.replace(/_/g, " ")}
                      </StatusPill>
                    </div>

                    <p className="mt-3 text-xs text-muted">{describeCopyAccess(access)}</p>

                    {access.status !== "NONE" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusPill tone={access.tier === "PREMIUM" ? "accent" : "muted"}>
                          {getCopyTierLabel(access.tier)}
                        </StatusPill>
                        {access.currentPeriodEnd ? (
                          <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">
                            {access.status === "ACTIVE" ? "Renews" : "Ends"}{" "}
                            {new Date(access.currentPeriodEnd).toLocaleDateString()}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {canPurchase ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setCopyTierModal({ tier: "NORMAL", accountId: account.accountId })}
                          className="rounded-2xl border border-line bg-panel p-4 text-left hover:border-accent/50"
                        >
                          <p className="text-sm font-semibold text-foreground">Normal</p>
                          <p className="mt-0.5 text-xs text-muted">Standard copy speed</p>
                          <p className="mt-2 text-sm font-semibold text-accent">$10 / month</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCopyTierModal({ tier: "PREMIUM", accountId: account.accountId })}
                          className="rounded-2xl border border-line bg-panel p-4 text-left hover:border-accent/50"
                        >
                          <p className="text-sm font-semibold text-foreground">Ultra Fast</p>
                          <p className="mt-0.5 text-xs text-muted">Lowest latency execution</p>
                          <p className="mt-2 text-sm font-semibold text-accent">$15 / month</p>
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {notice ? (
          <div
            className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-medium ${
              notice.type === "success"
                ? "border-accent/20 bg-accent/10 text-accent"
                : "border-danger/20 bg-danger/10 text-danger"
            }`}
          >
            {notice.text}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Available strategies</h2>
              {!hasActiveCopyAccess ? (
                <p className="mt-1 text-xs text-muted">
                  Activate copy access on at least one account to start following strategies.
                </p>
              ) : null}
            </div>
            {isLoading ? (
              <p className="text-sm text-muted">Loading...</p>
            ) : strategies.length === 0 ? (
              <EmptyState title="No strategies available" description="There are no active copy strategies to follow yet." />
            ) : (
              <div className="space-y-3">
                {strategies.map((strategy) => (
                  <div key={strategy.id} className="rounded-xl border border-line bg-background px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{strategy.name}</p>
                      <span
                        title={
                          strategy.mode === "LIVE"
                            ? "Live mode: trades may execute on your account"
                            : "Simulation mode: trades are tracked but not executed"
                        }
                      >
                        <StatusPill tone={strategy.mode === "LIVE" ? "danger" : "muted"}>
                          {strategy.mode}
                        </StatusPill>
                      </span>
                    </div>
                    {strategy.description ? <p className="mt-1 text-xs text-muted">{strategy.description}</p> : null}
                    {strategy.mode === "LIVE" ? (
                      <p className="mt-1 text-xs text-danger">
                        Live mode - copied trades may execute on your connected account.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted">Simulation mode - no real trades are placed.</p>
                    )}
                    <div className="mt-3">
                      <GhostButton
                        type="button"
                        disabled={!hasActiveCopyAccess}
                        onClick={() => openFollowDialog(strategy)}
                      >
                        <Repeat className="mr-2 inline-block h-4 w-4" /> Follow
                      </GhostButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="min-w-0">
            <h2 className="mb-4 text-lg font-semibold text-foreground">My following</h2>
            {subscriptions.length === 0 ? (
              <p className="text-sm text-muted">You are not following any strategy yet.</p>
            ) : (
              <div className="space-y-3">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="rounded-xl border border-line bg-background px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{sub.strategyName ?? "Strategy"}</p>
                        <p className="truncate text-xs text-muted">{sub.followerAccountName ?? sub.followerAccountId}</p>
                      </div>
                      <StatusPill tone={STATUS_TONE[sub.status] ?? "muted"}>{sub.status}</StatusPill>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusPill tone={sub.tier === "PREMIUM" ? "accent" : "muted"}>{sub.tier}</StatusPill>
                    </div>
                    {sub.status !== "REVOKED" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {sub.status === "ACTIVE" ? (
                          <GhostButton
                            type="button"
                            disabled={updateSub.isPending}
                            onClick={() => updateSub.mutate({ id: sub.id, status: "PAUSED" })}
                          >
                            Pause
                          </GhostButton>
                        ) : (
                          <GhostButton
                            type="button"
                            disabled={updateSub.isPending}
                            onClick={() => updateSub.mutate({ id: sub.id, status: "ACTIVE" })}
                          >
                            Resume
                          </GhostButton>
                        )}
                        <GhostButton
                          type="button"
                          disabled={updateSub.isPending}
                          onClick={() => setRevokeSubId(sub.id)}
                        >
                          Stop following
                        </GhostButton>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <Panel className="mt-5 min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">My copy logs</h2>
            {logs.length > 0 ? (
              <FilterChipRow
                chips={(["ALL", "SUCCESS", "SKIPPED", "FAILED"] as const).map((status) => ({
                  label: status === "ALL" ? `All (${logs.length})` : status,
                  active: logStatusFilter === status,
                  onClick: () => setLogStatusFilter(status),
                }))}
              />
            ) : null}
          </div>
          {logs.length === 0 ? (
            <p className="text-sm text-muted">No copy activity yet. Logs appear after simulation or live copy runs.</p>
          ) : (() => {
            const filtered = logStatusFilter === "ALL" ? logs : logs.filter((log) => log.status === logStatusFilter);
            const shown = filtered.slice(0, 50);
            return (
              <>
                {filtered.length !== logs.length || filtered.length > 50 ? (
                  <p className="mb-3 text-xs text-muted">
                    Showing {shown.length} of {filtered.length}
                    {logStatusFilter !== "ALL" ? ` ${logStatusFilter}` : ""} logs
                  </p>
                ) : null}
                <DataTable
                  headers={["Date", "Symbol", "Action", "Mode", "Lot", "Status"]}
                  rows={shown.map((log) => [
                    <span key="d">{new Date(log.createdAt).toLocaleString()}</span>,
                    <span key="s">{log.symbol ?? "-"}</span>,
                    <span key="a">{log.action}</span>,
                    <span key="m">{log.mode}</span>,
                    <span key="l">{log.calculatedLot ?? "-"}</span>,
                    <StatusPill key="st" tone={STATUS_TONE[log.status] ?? "muted"}>
                      {log.status}
                    </StatusPill>,
                  ])}
                />
              </>
            );
          })()}
        </Panel>

        <Dialog.Root open={Boolean(revokeSubId)} onOpenChange={(open) => !open && setRevokeSubId(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-danger/30 bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
              <Dialog.Title className="flex items-center gap-2 text-xl font-semibold text-foreground">
                <AlertTriangle className="h-5 w-5 text-danger" />
                Stop following?
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                This will revoke your subscription. Open positions copied to your account are{" "}
                <strong className="text-foreground">not</strong> automatically closed - you are responsible for managing them.
              </Dialog.Description>
              <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
                <Dialog.Close asChild>
                  <GhostButton type="button">Keep following</GhostButton>
                </Dialog.Close>
                <GhostButton
                  type="button"
                  disabled={updateSub.isPending}
                  onClick={() => {
                    if (revokeSubId) {
                      updateSub.mutate({ id: revokeSubId, status: "REVOKED" });
                      setRevokeSubId(null);
                    }
                  }}
                >
                  {updateSub.isPending ? "Stopping..." : "Yes, stop following"}
                </GhostButton>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-line bg-background text-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <Dialog.Root open={Boolean(followStrategy)} onOpenChange={(open) => !open && setFollowStrategy(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
              <Dialog.Title className="text-xl font-semibold text-foreground">Follow {followStrategy?.name}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                Choose which approved account copies this strategy, then accept the risk disclaimer.
              </Dialog.Description>
              <div className="mt-5 grid gap-4">
                <SelectField
                  label="Your account"
                  value={followAccountId}
                  onChange={(e) => setFollowAccountId(e.target.value)}
                >
                  <option value="">Select an account...</option>
                  {activeCopyAccountOptions.map((account) => (
                    <option key={account.accountId} value={account.accountId}>
                      {account.accountName} - {account.status}
                    </option>
                  ))}
                </SelectField>
                <label className="flex items-start gap-3 rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I understand trading involves risk of loss, copy trading does not guarantee profit, and I can pause or
                    stop at any time.
                  </span>
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
                <Dialog.Close asChild>
                  <GhostButton type="button">Cancel</GhostButton>
                </Dialog.Close>
                <PrimaryButton
                  type="button"
                  disabled={!followAccountId || !consent || follow.isPending}
                  onClick={() => follow.mutate()}
                >
                  {follow.isPending ? "Following..." : "Confirm & follow"}
                </PrimaryButton>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-line bg-background text-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </WorkspacePage>

      {copyTierModal ? (
        <BillingCheckoutModal
          open={Boolean(copyTierModal)}
          onClose={() => setCopyTierModal(null)}
          product={getCopyCheckoutProduct(copyTierModal.tier)}
          tradingAccountId={copyTierModal.accountId}
          accounts={accounts.map((account) => ({
            accountId: account.accountId,
            accountName: account.accountName,
          }))}
        />
      ) : null}
    </>
  );
}
