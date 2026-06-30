"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Play, Plus, Power, Repeat, ShieldOff, X } from "lucide-react";
import {
  DataTable,
  EmptyState,
  GhostButton,
  InlineStatusStrip,
  Panel,
  PageActionGroup,
  PrimaryButton,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { SelectField, TextField } from "@/components/app/FormFields";
import type {
  CopyGlobalSettingsDto,
  CopyLogDto,
  CopyStrategyDto,
  MasterEventDto,
} from "@/lib/copy/types";
import type { TraderAccountSummary } from "@/lib/domain/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data;
}

const STATUS_TONE: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  ACTIVE: "lime",
  DRAFT: "muted",
  PAUSED: "accent",
  ARCHIVED: "muted",
  SUCCESS: "lime",
  SKIPPED: "muted",
  FAILED: "danger",
  PENDING: "accent",
  RETRYING: "accent",
};

export default function AdminCopyPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ name: "", masterAccountId: "", riskMultiplier: "1" });

  const { data: settings } = useQuery<CopyGlobalSettingsDto & { executionConfigured: boolean; metaapiTokenConfigured: boolean; encryptionConfigured: boolean }>({
    queryKey: ["admin-copy-settings"],
    queryFn: () => getJson("/api/admin/copy/settings"),
  });
  const [executeEventId, setExecuteEventId] = useState<string | null>(null);
  const { data: strategies = [], isLoading } = useQuery<CopyStrategyDto[]>({
    queryKey: ["admin-copy-strategies"],
    queryFn: () => getJson("/api/admin/copy/strategies"),
  });
  // The full account list is only needed for the "create strategy" master
  // dropdown — defer this heavy query until the dialog actually opens.
  const { data: accounts = [] } = useQuery<TraderAccountSummary[]>({
    queryKey: ["admin-accounts"],
    queryFn: () => getJson("/api/admin/accounts"),
    enabled: createOpen,
  });

  const selectedStrategyId = selectedId || strategies[0]?.id || "";
  const selectedStrategy = strategies.find((s) => s.id === selectedStrategyId) ?? strategies[0];
  const { data: events = [] } = useQuery<MasterEventDto[]>({
    queryKey: ["admin-copy-events", selectedStrategyId],
    queryFn: () => getJson(`/api/admin/copy/strategies/${selectedStrategyId}/events`),
    enabled: Boolean(selectedStrategyId),
  });
  const { data: logs = [] } = useQuery<CopyLogDto[]>({
    queryKey: ["admin-copy-logs", selectedStrategyId],
    queryFn: () => getJson(`/api/admin/copy/logs?strategyId=${selectedStrategyId}`),
    enabled: Boolean(selectedStrategyId),
  });
  const { data: masterCredStatus } = useQuery<{ credentialsStored: boolean; providerAccountId: string | null; lastSyncedAt: string | null }>({
    queryKey: ["master-cred-status", selectedStrategy?.masterAccountId],
    queryFn: () => getJson(`/api/trading-accounts/${selectedStrategy!.masterAccountId}/broker-credentials`),
    enabled: Boolean(selectedStrategy?.masterAccountId),
    refetchOnWindowFocus: false,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["admin-copy-strategies"] });
    queryClient.invalidateQueries({ queryKey: ["admin-copy-events", selectedStrategyId] });
    queryClient.invalidateQueries({ queryKey: ["admin-copy-logs", selectedStrategyId] });
    queryClient.invalidateQueries({ queryKey: ["admin-copy-settings"] });
  }

  const action = useMutation({
    mutationFn: async ({
      url,
      method,
      body,
    }: {
      url: string;
      method: string;
      body?: unknown;
      label?: string;
    }) => {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
      return json.data;
    },
    onSuccess: (_d, vars) => {
      invalidateAll();
      setNotice({ type: "success", text: `Done: ${vars.label ?? "updated"}.` });
    },
    onError: (err: Error) => setNotice({ type: "error", text: err.message }),
  });

  const failedToday = logs.filter(
    (l) => l.status === "FAILED" && new Date(l.createdAt).toDateString() === new Date().toDateString(),
  ).length;

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="Copy Trading Control Center"
      description="Monitor master strategies, dry-run with simulation, and govern live execution."
      action={
        <PageActionGroup>
          <PrimaryButton type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 inline-block h-4 w-4" />
            New strategy
          </PrimaryButton>
        </PageActionGroup>
      }
    >
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Live execution is <strong>disabled by default</strong>. Always use simulation before enabling live copy.
          Live order execution is not yet connected to a broker — live attempts return{" "}
          <code>COPY_EXECUTION_NOT_CONFIGURED</code>.
        </p>
      </div>

      <InlineStatusStrip
        items={[
          {
            label: "Live copy",
            value: settings?.liveCopyEnabled ? "ENABLED" : "DISABLED",
            tone: settings?.liveCopyEnabled ? "danger" : "lime",
          },
          {
            label: "Emergency stop",
            value: settings?.emergencyStopEnabled ? "ON" : "OFF",
            tone: settings?.emergencyStopEnabled ? "danger" : "lime",
          },
          {
            label: "Live execution",
            value: settings?.executionConfigured ? "CONFIGURED" : "NOT CONFIGURED",
            tone: settings?.executionConfigured ? "lime" : "danger",
          },
          { label: "Active strategies", value: strategies.filter((s) => s.status === "ACTIVE").length, tone: "accent" },
          { label: "Followers", value: strategies.reduce((s, x) => s + x.followerCount, 0) },
          { label: "Failed copies today", value: failedToday, tone: failedToday > 0 ? "danger" : undefined },
        ]}
      />

      {notice ? (
        <div
          className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-medium ${
            notice.type === "success"
              ? "border-accent/20 bg-accent/10 text-accent"
              : "border-danger/20 bg-danger/10 text-danger"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      {/* Global safety controls */}
      <Panel className="mt-5">
        <h2 className="text-lg font-semibold text-foreground">Global safety</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <GhostButton
            type="button"
            onClick={() =>
              action.mutate({
                url: "/api/admin/copy/settings",
                method: "PATCH",
                body: { liveCopyEnabled: !settings?.liveCopyEnabled },
                label: "global live toggle",
              })
            }
          >
            <Power className="mr-2 inline-block h-4 w-4" />
            {settings?.liveCopyEnabled ? "Disable live copy" : "Enable live copy"}
          </GhostButton>
          <GhostButton
            type="button"
            onClick={() =>
              action.mutate({
                url: "/api/admin/copy/settings",
                method: "PATCH",
                body: { emergencyStopEnabled: !settings?.emergencyStopEnabled },
                label: "emergency stop",
              })
            }
          >
            <ShieldOff className="mr-2 inline-block h-4 w-4" />
            {settings?.emergencyStopEnabled ? "Clear emergency stop" : "Emergency stop"}
          </GhostButton>
        </div>
      </Panel>

      {/* Verification readiness checklist */}
      <Panel className="mt-5">
        <h2 className="text-lg font-semibold text-foreground">Demo verification readiness</h2>
        <p className="mt-1 text-sm text-muted">
          Complete this checklist before enabling live execution. None of these items trigger live trades.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                label: "Encryption key configured",
                ok: settings?.encryptionConfigured,
                hint: "Set ENCRYPTION_KEY in environment",
              },
              {
                label: "MetaAPI token configured",
                ok: settings?.metaapiTokenConfigured,
                hint: "Set METAAPI_TOKEN in environment",
              },
              {
                label: "Master account has credentials",
                ok: masterCredStatus?.credentialsStored,
                hint: selectedStrategy ? `For: ${selectedStrategy.masterAccountName ?? selectedStrategy.masterAccountId}` : "Select a strategy",
              },
              {
                label: "Master account synced (MetaAPI ID)",
                ok: Boolean(masterCredStatus?.providerAccountId),
                hint: masterCredStatus?.lastSyncedAt
                  ? `Last synced ${new Date(masterCredStatus.lastSyncedAt).toLocaleString()}`
                  : "Run sync on the account page",
              },
              {
                label: "At least one active follower",
                ok: (selectedStrategy?.followerCount ?? 0) > 0,
                hint: `${selectedStrategy?.followerCount ?? 0} follower(s) on selected strategy`,
              },
              {
                label: "Simulation logs exist",
                ok: logs.some((l) => l.mode === "SIMULATION"),
                hint: "Run simulate on a master event first",
              },
              {
                label: "Live execution disabled",
                ok: !settings?.executionConfigured,
                tone: "safe" as const,
                hint: settings?.executionConfigured
                  ? "BROKER_EXECUTION_ENABLED=true — live orders can be placed"
                  : "BROKER_EXECUTION_ENABLED=false — safe for testing",
              },
              {
                label: "Emergency stop off",
                ok: !settings?.emergencyStopEnabled,
                tone: "safe" as const,
                hint: settings?.emergencyStopEnabled ? "Emergency stop is ON — all execution blocked" : "Normal mode",
              },
            ] as Array<{ label: string; ok: boolean | undefined; hint: string; tone?: string }>
          ).map(({ label, ok, hint }) => (
            <div
              key={label}
              className="flex items-start gap-3 rounded-xl border border-line bg-background px-3 py-2.5"
            >
              <span
                className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-accent-2" : ok === false ? "bg-danger" : "bg-muted/30"}`}
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{label}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>
              </div>
            </div>
          ))}
        </div>
        {!settings?.executionConfigured ? (
          <p className="mt-4 text-xs text-muted">
            <strong className="text-accent-2">Safe:</strong> Live execution is disabled by environment flag. Simulation and monitoring are fully safe to run.
          </p>
        ) : (
          <p className="mt-4 text-xs text-danger">
            <strong>Warning:</strong> BROKER_EXECUTION_ENABLED=true — Execute will place real orders on follower accounts.
          </p>
        )}
      </Panel>

      {/* Strategies */}
      <div className="mt-5">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl border border-line bg-panel animate-pulse" />
            ))}
          </div>
        ) : strategies.length === 0 ? (
          <EmptyState
            title="No copy strategies yet"
            description="Create a strategy linked to a master trading account to begin monitoring trades."
          />
        ) : (
          <Panel className="min-w-0">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Strategies</h2>
            <DataTable
              headers={["Strategy", "Master", "Status", "Mode", "Followers", "Actions"]}
              rows={strategies.map((s) => [
                <button key="n" type="button" onClick={() => setSelectedId(s.id)} className="text-left">
                  <p className="text-sm font-semibold text-foreground hover:text-accent">{s.name}</p>
                </button>,
                <span key="m">{s.masterAccountName ?? "—"}</span>,
                <StatusPill key="s" tone={STATUS_TONE[s.status] ?? "muted"}>{s.status}</StatusPill>,
                <StatusPill key="mo" tone={s.mode === "LIVE" ? "danger" : "muted"}>{s.mode}</StatusPill>,
                <span key="f">{s.followerCount}</span>,
                <div key="a" className="flex flex-wrap gap-2">
                  <GhostButton
                    type="button"
                    onClick={() =>
                      action.mutate({ url: `/api/admin/copy/strategies/${s.id}/monitor`, method: "POST", label: "monitor" })
                    }
                  >
                    <Repeat className="mr-1 inline-block h-3.5 w-3.5" /> Monitor
                  </GhostButton>
                  <GhostButton
                    type="button"
                    onClick={() =>
                      action.mutate({ url: `/api/admin/copy/strategies/${s.id}/simulate`, method: "POST", label: "simulate" })
                    }
                  >
                    <Play className="mr-1 inline-block h-3.5 w-3.5" /> Simulate
                  </GhostButton>
                  {s.status !== "ACTIVE" ? (
                    <GhostButton
                      type="button"
                      onClick={() =>
                        action.mutate({ url: `/api/admin/copy/strategies/${s.id}`, method: "PATCH", body: { status: "ACTIVE" }, label: "activate" })
                      }
                    >
                      Activate
                    </GhostButton>
                  ) : (
                    <GhostButton
                      type="button"
                      onClick={() =>
                        action.mutate({ url: `/api/admin/copy/strategies/${s.id}`, method: "PATCH", body: { status: "PAUSED" }, label: "pause" })
                      }
                    >
                      Pause
                    </GhostButton>
                  )}
                </div>,
              ])}
            />
          </Panel>
        )}
      </div>

      {/* Selected strategy: events + logs */}
      {selectedStrategyId ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Panel>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Master events</h3>
            {events.length === 0 ? (
              <p className="text-sm text-muted">No master events detected yet. Click Monitor.</p>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 15).map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-background px-3 py-2 text-xs">
                    <span className="font-semibold text-foreground">{e.symbol} · {e.side ?? "—"} · {e.volume ?? "—"}</span>
                    <div className="flex items-center gap-2">
                      <StatusPill tone={e.eventType === "OPEN" ? "lime" : "muted"}>{e.eventType}</StatusPill>
                      <GhostButton
                        type="button"
                        onClick={() => action.mutate({ url: `/api/admin/copy/events/${e.id}/simulate`, method: "POST", label: "simulate event" })}
                      >
                        Simulate
                      </GhostButton>
                      <GhostButton
                        type="button"
                        title={settings?.executionConfigured ? "Execute live copy" : "Live execution is not configured"}
                        onClick={() => { setNotice(null); setExecuteEventId(e.id); }}
                      >
                        Execute
                      </GhostButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Execution logs</h3>
            {logs.length === 0 ? (
              <p className="text-sm text-muted">No simulation/execution logs yet.</p>
            ) : (
              <div className="space-y-2">
                {logs.slice(0, 15).map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-background px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-semibold text-foreground">{l.symbol ?? "—"} · {l.action}</span>
                      <span className="ml-2 text-muted">{l.mode}</span>
                      {l.calculatedLot ? <span className="ml-2 text-muted">lot {l.calculatedLot}</span> : null}
                      {l.errorMessage ? <p className="truncate text-muted">{l.errorMessage}</p> : null}
                    </div>
                    <StatusPill tone={STATUS_TONE[l.status] ?? "muted"}>{l.status}</StatusPill>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {/* Create strategy dialog */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
            <Dialog.Title className="text-xl font-semibold text-foreground">New copy strategy</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              Link a master trading account. New strategies start in SIMULATION with live disabled.
            </Dialog.Description>
            <div className="mt-5 grid gap-4">
              <TextField label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <SelectField
                label="Master account"
                value={form.masterAccountId}
                onChange={(e) => setForm((f) => ({ ...f, masterAccountId: e.target.value }))}
              >
                <option value="">Select an account…</option>
                {accounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.accountName} — {a.brokerName}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Risk multiplier"
                type="number"
                value={form.riskMultiplier}
                onChange={(e) => setForm((f) => ({ ...f, riskMultiplier: e.target.value }))}
              />
            </div>
            <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
              <Dialog.Close asChild>
                <GhostButton type="button">Cancel</GhostButton>
              </Dialog.Close>
              <PrimaryButton
                type="button"
                disabled={!form.name.trim() || !form.masterAccountId}
                onClick={() => {
                  action.mutate({
                    url: "/api/admin/copy/strategies",
                    method: "POST",
                    body: {
                      name: form.name.trim(),
                      masterAccountId: form.masterAccountId,
                      riskMultiplier: Number(form.riskMultiplier) || 1,
                    },
                    label: "strategy created",
                  });
                  setCreateOpen(false);
                  setForm({ name: "", masterAccountId: "", riskMultiplier: "1" });
                }}
              >
                Create
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

      {/* Execute confirmation dialog */}
      <Dialog.Root open={Boolean(executeEventId)} onOpenChange={(o) => !o && setExecuteEventId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-danger/30 bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
            <Dialog.Title className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <AlertTriangle className="h-5 w-5 text-danger" />
              Execute live copy
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              This may place <strong className="text-danger">live trades on follower MT5 accounts</strong>. All safety
              gates (global live, strategy live, consent, risk) still apply.
              {settings?.executionConfigured
                ? " Execution is configured."
                : " Live execution is NOT configured — this will return COPY_EXECUTION_NOT_CONFIGURED."}
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
              <Dialog.Close asChild>
                <GhostButton type="button">Cancel</GhostButton>
              </Dialog.Close>
              <PrimaryButton
                type="button"
                onClick={() => {
                  if (executeEventId) {
                    action.mutate({ url: `/api/admin/copy/events/${executeEventId}/execute`, method: "POST", label: "execute" });
                  }
                  setExecuteEventId(null);
                }}
              >
                Confirm execute
              </PrimaryButton>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </WorkspacePage>
  );
}
