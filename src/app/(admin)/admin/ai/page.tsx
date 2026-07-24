"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ImagePlus, Loader2, Send, X } from "lucide-react";
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
import { AiProviderSettingsPanel } from "@/components/admin/AiProviderSettingsPanel";

interface UsageSummary {
  today: { total: number; chat: number; chartAnalysis: number; failed: number };
  byUserToday: Array<{ userId: string; userName: string; chat: number; chartAnalysis: number }>;
  recent: Array<{
    id: string;
    userName: string;
    route: "chat" | "chart-analysis";
    feature: "ADMIN_ASSISTANT" | "ADMIN_IMAGE_ANALYSIS" | "TRADER_ASSISTANT" | "TRADER_CHART_ASSISTANT";
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
  aiTokenCredits: number;
}

export default function AdminAiPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [disableAiUser, setDisableAiUser] = useState<AiUser | null>(null);

  useEffect(() => {
    if (!notice || notice.type !== "success") return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const [chatLimitInput, setChatLimitInput] = useState("");
  const [chartLimitInput, setChartLimitInput] = useState("");
  const [creditInput, setCreditInput] = useState("");
  const [creditMode, setCreditMode] = useState<"add" | "set">("add");
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantResult, setAssistantResult] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageFocus, setImageFocus] = useState("");
  const [imageResult, setImageResult] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageLoading, setImageLoading] = useState(false);

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
    if (u.aiEnabled) {
      setDisableAiUser(u);
    } else {
      mutation.mutate({ userId: u.userId, body: { aiEnabled: true } });
    }
  }

  function saveLimits(u: AiUser) {
    setNotice(null);
    const body: { chatDailyLimit?: number | null; chartDailyLimit?: number | null } = {};
    body.chatDailyLimit = chatLimitInput.trim() === "" ? null : Math.max(0, Number.parseInt(chatLimitInput, 10) || 0);
    body.chartDailyLimit = chartLimitInput.trim() === "" ? null : Math.max(0, Number.parseInt(chartLimitInput, 10) || 0);
    mutation.mutate({ userId: u.userId, body });
  }

  const creditMutation = useMutation({
    mutationFn: async (payload: { userId: string; amount: number; mode: "add" | "set" }) => {
      const res = await fetch(`/api/admin/ai/users/${payload.userId}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: payload.amount, mode: payload.mode }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update credits");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminAiUsers });
      setCreditInput("");
      setNotice({ type: "success", text: "Token credits updated." });
    },
    onError: (err: Error) => setNotice({ type: "error", text: err.message }),
  });

  function saveCredits(u: AiUser) {
    setNotice(null);
    const amount = Math.max(0, Number.parseInt(creditInput, 10) || 0);
    creditMutation.mutate({ userId: u.userId, amount, mode: creditMode });
  }

  function selectUser(u: AiUser) {
    setSelectedId(u.userId);
    setChatLimitInput(u.chatDailyLimit === null ? "" : String(u.chatDailyLimit));
    setChartLimitInput(u.chartDailyLimit === null ? "" : String(u.chartDailyLimit));
    setCreditInput("");
  }

  async function runAdminAssistant() {
    const message = assistantPrompt.trim();
    if (!message || assistantLoading) return;
    setAssistantLoading(true);
    setAssistantError("");
    setAssistantResult("");
    try {
      const response = await fetch("/api/ai/admin-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, pageContext: "admin-ai-controls" }),
      });
      const json = await response.json();
      if (!json.ok) {
        setAssistantError(json.error?.message ?? "Admin assistant is unavailable.");
        return;
      }
      setAssistantResult(json.data.message);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminAiUsage });
    } catch {
      setAssistantError("Network error while contacting the admin assistant.");
    } finally {
      setAssistantLoading(false);
    }
  }

  async function runImageAnalysis() {
    if (!imageFile || imageLoading) return;
    setImageLoading(true);
    setImageError("");
    setImageResult("");
    try {
      const form = new FormData();
      form.append("image", imageFile);
      if (imageFocus.trim()) form.append("prompt", imageFocus.trim());
      const response = await fetch("/api/ai/chart-analysis", { method: "POST", body: form });
      const json = await response.json();
      if (!json.ok) {
        setImageError(json.error?.message ?? "Image analysis is unavailable.");
        return;
      }
      setImageResult(json.data.message);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminAiUsage });
    } catch {
      setImageError("Network error while analyzing the image.");
    } finally {
      setImageLoading(false);
    }
  }

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="AI Controls"
      description="Use admin-only AI tools, monitor metadata-only usage, and manage per-user limits."
    >
      <AiProviderSettingsPanel />
      <div className="mb-5 grid items-stretch gap-5 xl:h-[560px] xl:grid-cols-2">
        <Panel className="invisible-scrollbar min-h-0 overflow-y-auto xl:h-full">
          <h2 className="text-lg font-semibold text-foreground">Admin assistant</h2>
          <p className="mt-1 text-sm text-muted">
            Operations and support guidance without automatic access to platform-wide user data.
          </p>
          <textarea
            value={assistantPrompt}
            onChange={(event) => setAssistantPrompt(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Draft a risk-review checklist for a disconnected trader account."
            className="mt-4 w-full resize-none rounded-[4px] border border-line bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-accent"
          />
          <PrimaryButton
            type="button"
            disabled={assistantLoading || assistantPrompt.trim().length === 0}
            onClick={() => void runAdminAssistant()}
            className="mt-3"
          >
            {assistantLoading ? <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" /> : <Send className="mr-2 inline-block h-4 w-4" />}
            {assistantLoading ? "Thinking…" : "Ask WSA Assistant"}
          </PrimaryButton>
          {assistantError ? <p className="mt-3 text-sm text-danger">{assistantError}</p> : null}
          {assistantResult ? (
            <div className="mt-4 whitespace-pre-wrap rounded-[4px] border border-line bg-background px-4 py-4 text-sm leading-6 text-foreground/90">
              {assistantResult}
            </div>
          ) : null}
        </Panel>

        <Panel className="invisible-scrollbar min-h-0 overflow-y-auto xl:h-full">
          <h2 className="text-lg font-semibold text-foreground">Admin image analysis</h2>
          <p className="mt-1 text-sm text-muted">
            Generic image upload is available only to Admin and Super Admin. Images are not written to usage logs.
          </p>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              setImageFile(event.target.files?.[0] ?? null);
              setImageError("");
              setImageResult("");
            }}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <GhostButton type="button" onClick={() => imageInputRef.current?.click()}>
              <ImagePlus className="mr-2 inline-block h-4 w-4" />
              {imageFile ? "Change image" : "Choose image"}
            </GhostButton>
            <span className="max-w-xs truncate text-xs text-muted">
              {imageFile ? imageFile.name : "PNG, JPG, or WebP · max 5MB"}
            </span>
          </div>
          <textarea
            value={imageFocus}
            onChange={(event) => setImageFocus(event.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Optional analysis focus"
            className="mt-3 w-full resize-none rounded-[4px] border border-line bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-accent"
          />
          <PrimaryButton
            type="button"
            disabled={!imageFile || imageLoading}
            onClick={() => void runImageAnalysis()}
            className="mt-3"
          >
            {imageLoading ? <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 inline-block h-4 w-4" />}
            {imageLoading ? "Analyzing…" : "Analyze image"}
          </PrimaryButton>
          {imageError ? <p className="mt-3 text-sm text-danger">{imageError}</p> : null}
          {imageResult ? (
            <div className="mt-4 whitespace-pre-wrap rounded-[4px] border border-line bg-background px-4 py-4 text-sm leading-6 text-foreground/90">
              {imageResult}
            </div>
          ) : null}
        </Panel>
      </div>

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
          className={`mt-5 rounded-[4px] border px-4 py-3 text-sm font-medium ${
            notice.type === "success"
              ? "border-accent/20 bg-accent/10 text-accent"
              : "border-danger/20 bg-danger/10 text-danger"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <div className="mt-5 grid items-stretch gap-5 xl:h-[680px] xl:grid-cols-[1.5fr_1fr]">
        {/* Users + limits */}
        <Panel className="flex min-h-0 min-w-0 flex-col overflow-hidden xl:h-full">
          <h2 className="text-lg font-semibold text-foreground">Trader AI limits</h2>
          <p className="mt-1 text-sm text-muted">Select a user to manage their access and daily limits.</p>

          <div className="invisible-scrollbar mt-4 min-h-0 flex-1 overflow-auto">
            {usersLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 rounded-[4px] border border-line bg-panel animate-pulse" />
                ))}
              </div>
            ) : isError ? (
              <div className="rounded-[4px] border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                Failed to load users.
              </div>
            ) : users.length === 0 ? (
              <EmptyState title="No users" description="No users to manage yet." />
            ) : (
              <DataTable
                headers={["User", "Access", "Chat (used/limit)", "Chart (used/limit)", "Credits", ""]}
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
                  <span key="cr" className={u.aiTokenCredits === 0 ? "text-danger font-semibold" : u.aiTokenCredits < 5000 ? "text-amber-400 font-semibold" : "text-foreground"}>
                    {u.aiTokenCredits.toLocaleString()}
                  </span>,
                  <GhostButton key="b" type="button" onClick={() => selectUser(u)}>
                    Manage
                  </GhostButton>,
                ])}
              />
            )}
          </div>
        </Panel>

        {/* Selected user controls + recent activity */}
        <div className="flex min-h-0 flex-col gap-5 xl:h-full">
          {selected ? (
            <Panel className="invisible-scrollbar min-h-0 shrink overflow-y-auto">
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

              <div className="mt-5 border-t border-line pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Token credits</p>
                <p className="mt-1 text-sm text-muted">
                  Balance: <span className={selected.aiTokenCredits === 0 ? "font-bold text-danger" : selected.aiTokenCredits < 5000 ? "font-bold text-amber-400" : "font-semibold text-foreground"}>{selected.aiTokenCredits.toLocaleString()}</span>
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[140px]">
                    <TextField
                      label="Amount"
                      type="number"
                      min={0}
                      placeholder="e.g. 50000"
                      value={creditInput}
                      onChange={(e) => setCreditInput(e.target.value)}
                    />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs font-medium text-muted mb-1">Mode</label>
                    <select
                      value={creditMode}
                      onChange={(e) => setCreditMode(e.target.value as "add" | "set")}
                      className="w-full rounded-[4px] border border-line bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="add">Add</option>
                      <option value="set">Set exact</option>
                    </select>
                  </div>
                  <GhostButton
                    type="button"
                    disabled={creditMutation.isPending || !creditInput.trim()}
                    onClick={() => saveCredits(selected)}
                  >
                    {creditMutation.isPending ? "Updating…" : "Update credits"}
                  </GhostButton>
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
            <div className="invisible-scrollbar mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
              {(usage?.recent ?? []).slice(0, 12).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 border-b border-line bg-background px-3 py-2 text-xs last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{r.userName}</p>
                    <p className="truncate text-muted">
                      {r.feature.replaceAll("_", " ")} · {r.model}
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
      {/* Disable AI confirmation */}
      <Dialog.Root open={Boolean(disableAiUser)} onOpenChange={(o) => !o && setDisableAiUser(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75" />
          <Dialog.Content className="max-h-[90vh] invisible-scrollbar overflow-y-auto fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[6px] border border-danger/30 bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
            <Dialog.Title className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <AlertTriangle className="h-5 w-5 text-danger" />
              Disable AI for {disableAiUser?.name}?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              This will immediately block <strong className="text-foreground">{disableAiUser?.name}</strong> from using the AI assistant. Their chat history is preserved. You can re-enable at any time.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
              <Dialog.Close asChild>
                <GhostButton type="button">Cancel</GhostButton>
              </Dialog.Close>
              <GhostButton
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  if (disableAiUser) {
                    mutation.mutate({ userId: disableAiUser.userId, body: { aiEnabled: false } });
                    setDisableAiUser(null);
                  }
                }}
              >
                {mutation.isPending ? "Disabling…" : "Yes, disable AI"}
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
    </WorkspacePage>
  );
}
