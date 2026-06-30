"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { TextField } from "@/components/app/FormFields";
import { queryKeys } from "@/lib/data/queryKeys";

interface UsageSummary {
  today: { total: number; chat: number; chartAnalysis: number; failed: number };
  byUserToday: Array<{ userId: string; userName: string; chat: number; chartAnalysis: number }>;
  recent: Array<{
    id: string;
    userName: string;
    route: "chat" | "chart-analysis";
    model: string;
    status: "SUCCESS" | "FAILED";
    totalTokens: number | null;
    createdAt: string;
  }>;
}

interface AiUser {
  userId: string;
  name: string;
  email: string;
  role: string;
  aiEnabled: boolean;
  chatDailyLimit: number | null;
  chartDailyLimit: number | null;
  effectiveChatLimit: number;
  effectiveChartLimit: number;
  chatUsedToday: number;
  chartUsedToday: number;
}

export default function AdminAiPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [chatLimitInput, setChatLimitInput] = useState("");
  const [chartLimitInput, setChartLimitInput] = useState("");

  const { data: usage, isLoading: usageLoading } = useQuery<UsageSummary>({
    queryKey: queryKeys.adminAiUsage,
    queryFn: async () => {
      const res = await fetch("/api/admin/ai/usage");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load usage");
      return json.data;
    },
  });

  const { data: users = [], isLoading: usersLoading, isError } = useQuery<AiUser[]>({
    queryKey: queryKeys.adminAiUsers,
    queryFn: async () => {
      const res = await fetch("/api/admin/ai/users");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load users");
      return json.data;
    },
  });

  const effectiveSelectedId = selectedId || users[0]?.userId || "";
  const selected = useMemo(
    () => users.find((u) => u.userId === effectiveSelectedId) ?? users[0] ?? null,
    [users, effectiveSelectedId],
  );

  const mutation = useMutation({
    mutationFn: async (payload: {
      userId: string;
      body: { chatDailyLimit?: number | null; chartDailyLimit?: number | null; aiEnabled?: boolean };
    }) => {
      const res = await fetch(`/api/admin/ai/users/${payload.userId}/limits`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminAiUsers });
      queryClient.invalidateQueries({ queryKey: queryKeys.adminAiUsage });
      setNotice({ type: "success", text: "AI settings updated." });
    },
    onError: (err: Error) => setNotice({ type: "error", text: err.message }),
  });

  function toggleEnabled(u: AiUser) {
    setNotice(null);
    mutation.mutate({ userId: u.userId, body: { aiEnabled: !u.aiEnabled } });
  }

  function saveLimits(u: AiUser) {
    setNotice(null);
    const body: { chatDailyLimit?: number | null; chartDailyLimit?: number | null } = {};
    body.chatDailyLimit = chatLimitInput.trim() === "" ? null : Math.max(0, Number.parseInt(chatLimitInput, 10) || 0);
    body.chartDailyLimit = chartLimitInput.trim() === "" ? null : Math.max(0, Number.parseInt(chartLimitInput, 10) || 0);
    mutation.mutate({ userId: u.userId, body });
  }

  function selectUser(u: AiUser) {
    setSelectedId(u.userId);
    setChatLimitInput(u.chatDailyLimit === null ? "" : String(u.chatDailyLimit));
    setChartLimitInput(u.chartDailyLimit === null ? "" : String(u.chartDailyLimit));
  }

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="AI Controls"
      description="Monitor AI assistant usage and manage per-trader limits and access."
    >
      <InlineStatusStrip
        items={[
          { label: "Requests today", value: usageLoading ? "…" : usage?.today.total ?? 0, tone: "accent" },
          { label: "Chat", value: usageLoading ? "…" : usage?.today.chat ?? 0, tone: "lime" },
          { label: "Chart analyses", value: usageLoading ? "…" : usage?.today.chartAnalysis ?? 0, tone: "lime" },
          { label: "Failed", value: usageLoading ? "…" : usage?.today.failed ?? 0, tone: (usage?.today.failed ?? 0) > 0 ? "danger" : undefined },
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

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        {/* Users + limits */}
        <Panel className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Trader AI limits</h2>
          <p className="mt-1 text-sm text-muted">Select a user to manage their access and daily limits.</p>

          <div className="mt-4">
            {usersLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 rounded-xl border border-line bg-panel animate-pulse" />
                ))}
              </div>
            ) : isError ? (
              <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                Failed to load users.
              </div>
            ) : users.length === 0 ? (
              <EmptyState title="No users" description="No users to manage yet." />
            ) : (
              <DataTable
                headers={["User", "Access", "Chat (used/limit)", "Chart (used/limit)", ""]}
                rows={users.map((u) => [
                  <div key="u" className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{u.name}</p>
                    <p className="truncate text-xs text-muted">{u.email}</p>
                  </div>,
                  <StatusPill key="s" tone={u.aiEnabled ? "lime" : "danger"}>
                    {u.aiEnabled ? "ENABLED" : "DISABLED"}
                  </StatusPill>,
                  <span key="c">{u.chatUsedToday}/{u.effectiveChatLimit}</span>,
                  <span key="ch">{u.chartUsedToday}/{u.effectiveChartLimit}</span>,
                  <GhostButton key="b" type="button" onClick={() => selectUser(u)}>
                    Manage
                  </GhostButton>,
                ])}
              />
            )}
          </div>
        </Panel>

        {/* Selected user controls + recent activity */}
        <div className="space-y-5">
          {selected ? (
            <Panel>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Manage user</p>
                  <h3 className="mt-2 truncate text-lg font-semibold text-foreground">{selected.name}</h3>
                  <p className="truncate text-sm text-muted">{selected.email}</p>
                </div>
                <StatusPill tone={selected.aiEnabled ? "lime" : "danger"}>
                  {selected.aiEnabled ? "ENABLED" : "DISABLED"}
                </StatusPill>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4">
                {selected.aiEnabled ? (
                  <GhostButton type="button" disabled={mutation.isPending} onClick={() => toggleEnabled(selected)}>
                    Disable AI
                  </GhostButton>
                ) : (
                  <PrimaryButton type="button" disabled={mutation.isPending} onClick={() => toggleEnabled(selected)}>
                    Enable AI
                  </PrimaryButton>
                )}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Chat daily limit"
                  type="number"
                  min={0}
                  placeholder={`Default (${selected.effectiveChatLimit})`}
                  value={chatLimitInput}
                  onChange={(e) => setChatLimitInput(e.target.value)}
                  hint="Blank = use platform default"
                />
                <TextField
                  label="Chart daily limit"
                  type="number"
                  min={0}
                  placeholder={`Default (${selected.effectiveChartLimit})`}
                  value={chartLimitInput}
                  onChange={(e) => setChartLimitInput(e.target.value)}
                  hint="Blank = use platform default"
                />
              </div>
              <div className="mt-4">
                <PrimaryButton type="button" disabled={mutation.isPending} onClick={() => saveLimits(selected)}>
                  {mutation.isPending ? "Saving…" : "Save limits"}
                </PrimaryButton>
              </div>
            </Panel>
          ) : null}

          <Panel>
            <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
            <div className="mt-3 space-y-2">
              {(usage?.recent ?? []).slice(0, 12).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-background px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{r.userName}</p>
                    <p className="truncate text-muted">
                      {r.route} · {r.model}
                    </p>
                  </div>
                  <StatusPill tone={r.status === "SUCCESS" ? "lime" : "danger"}>{r.status}</StatusPill>
                </div>
              ))}
              {(usage?.recent ?? []).length === 0 ? (
                <p className="text-xs text-muted">No AI activity recorded yet.</p>
              ) : null}
            </div>
          </Panel>
        </div>
      </div>
    </WorkspacePage>
  );
}
