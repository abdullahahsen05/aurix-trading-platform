"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Repeat, X } from "lucide-react";
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
import { SelectField } from "@/components/app/FormFields";
import type { CopyFollowerDto, CopyLogDto } from "@/lib/copy/types";
import type { TraderStrategyDto } from "@/lib/services/copyTradingService";
import type { TraderAccountSummary } from "@/lib/domain/types";

type StrategyDto = TraderStrategyDto;

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
  REVOKED: "muted",
  DISABLED: "muted",
  SUCCESS: "lime",
  SKIPPED: "muted",
  FAILED: "danger",
};

export default function CopyTradingPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [followStrategy, setFollowStrategy] = useState<StrategyDto | null>(null);
  const [followAccountId, setFollowAccountId] = useState("");
  const [consent, setConsent] = useState(false);
  const [revokeSubId, setRevokeSubId] = useState<string | null>(null);
  const [logStatusFilter, setLogStatusFilter] = useState<"ALL" | "SUCCESS" | "SKIPPED" | "FAILED">("ALL");

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

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["copy-my-subscriptions"] });
    queryClient.invalidateQueries({ queryKey: ["copy-my-logs"] });
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
        {/* Available strategies */}
        <Panel>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Available strategies</h2>
          {isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : strategies.length === 0 ? (
            <EmptyState title="No strategies available" description="There are no active copy strategies to follow yet." />
          ) : (
            <div className="space-y-3">
              {strategies.map((s) => (
                <div key={s.id} className="rounded-xl border border-line bg-background px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{s.name}</p>
                    <span title={s.mode === "LIVE" ? "Live mode: trades may execute on your account" : "Simulation mode: trades are tracked but not executed"}>
                      <StatusPill tone={s.mode === "LIVE" ? "danger" : "muted"}>{s.mode}</StatusPill>
                    </span>
                  </div>
                  {s.description ? <p className="mt-1 text-xs text-muted">{s.description}</p> : null}
                  {s.mode === "LIVE" ? (
                    <p className="mt-1 text-xs text-danger">Live mode — copied trades may execute on your connected account.</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted">Simulation mode — no real trades are placed.</p>
                  )}
                  <div className="mt-3">
                    <GhostButton type="button" onClick={() => { setFollowStrategy(s); setNotice(null); }}>
                      <Repeat className="mr-2 inline-block h-4 w-4" /> Follow
                    </GhostButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* My subscriptions */}
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
                        <GhostButton type="button" disabled={updateSub.isPending} onClick={() => updateSub.mutate({ id: sub.id, status: "PAUSED" })}>
                          Pause
                        </GhostButton>
                      ) : (
                        <GhostButton type="button" disabled={updateSub.isPending} onClick={() => updateSub.mutate({ id: sub.id, status: "ACTIVE" })}>
                          Resume
                        </GhostButton>
                      )}
                      <GhostButton type="button" disabled={updateSub.isPending} onClick={() => setRevokeSubId(sub.id)}>
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

      {/* My copy logs */}
      <Panel className="mt-5 min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">My copy logs</h2>
          {logs.length > 0 ? (
            <FilterChipRow
              chips={(["ALL", "SUCCESS", "SKIPPED", "FAILED"] as const).map((s) => ({
                label: s === "ALL" ? `All (${logs.length})` : s,
                active: logStatusFilter === s,
                onClick: () => setLogStatusFilter(s),
              }))}
            />
          ) : null}
        </div>
        {logs.length === 0 ? (
          <p className="text-sm text-muted">No copy activity yet. Logs appear after simulation or live copy runs.</p>
        ) : (() => {
          const filtered = logStatusFilter === "ALL" ? logs : logs.filter((l) => l.status === logStatusFilter);
          const shown = filtered.slice(0, 50);
          return (
            <>
              {filtered.length !== logs.length || filtered.length > 50 ? (
                <p className="mb-3 text-xs text-muted">
                  Showing {shown.length} of {filtered.length}{logStatusFilter !== "ALL" ? ` ${logStatusFilter}` : ""} logs
                </p>
              ) : null}
              <DataTable
                headers={["Date", "Symbol", "Action", "Mode", "Lot", "Status"]}
                rows={shown.map((l) => [
                  <span key="d">{new Date(l.createdAt).toLocaleString()}</span>,
                  <span key="s">{l.symbol ?? "—"}</span>,
                  <span key="a">{l.action}</span>,
                  <span key="m">{l.mode}</span>,
                  <span key="l">{l.calculatedLot ?? "—"}</span>,
                  <StatusPill key="st" tone={STATUS_TONE[l.status] ?? "muted"}>{l.status}</StatusPill>,
                ])}
              />
            </>
          );
        })()}
      </Panel>

      {/* Stop following confirmation */}
      <Dialog.Root open={Boolean(revokeSubId)} onOpenChange={(o) => !o && setRevokeSubId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-danger/30 bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
            <Dialog.Title className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <AlertTriangle className="h-5 w-5 text-danger" />
              Stop following?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              This will revoke your subscription. Open positions copied to your account are <strong className="text-foreground">not</strong> automatically closed — you are responsible for managing them.
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
                {updateSub.isPending ? "Stopping…" : "Yes, stop following"}
              </GhostButton>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-line bg-background text-muted">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Follow dialog */}
      <Dialog.Root open={Boolean(followStrategy)} onOpenChange={(o) => !o && setFollowStrategy(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
            <Dialog.Title className="text-xl font-semibold text-foreground">Follow {followStrategy?.name}</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              Choose which of your accounts copies this strategy, then accept the risk disclaimer.
            </Dialog.Description>
            <div className="mt-5 grid gap-4">
              <SelectField label="Your account" value={followAccountId} onChange={(e) => setFollowAccountId(e.target.value)}>
                <option value="">Select an account…</option>
                {accounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.accountName} — {a.status}
                  </option>
                ))}
              </SelectField>
              <label className="flex items-start gap-3 rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
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
              <PrimaryButton type="button" disabled={!followAccountId || !consent || follow.isPending} onClick={() => follow.mutate()}>
                {follow.isPending ? "Following…" : "Confirm & follow"}
              </PrimaryButton>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-line bg-background text-muted">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </WorkspacePage>
  );
}
