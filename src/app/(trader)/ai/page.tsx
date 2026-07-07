"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import {
  EmptyState,
  GhostButton,
  InlineStatusStrip,
  Panel,
  PageActionGroup,
  PrimaryButton,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { PlatformSubscriptionLocked } from "@/components/app/PlatformSubscriptionLocked";
import { SelectField, TextAreaField } from "@/components/app/FormFields";
import { queryKeys } from "@/lib/data/queryKeys";
import type { TraderAccountSummary } from "@/lib/domain/types";
import { EMPTY_PLATFORM_SUBSCRIPTION_ACCESS, useTraderAccessSummary } from "@/hooks/useTraderAccessSummary";

const SUGGESTED_PROMPTS = [
  "Analyze my current account risk.",
  "Summarize my trading performance.",
  "What pairs am I overexposed on?",
  "Explain my recent drawdown.",
  "What should I watch before today's session?",
];

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

// Persist chat in the browser, keyed by user id, so it survives refresh and
// navigation without leaking to a different user on a shared browser.
const CHAT_STORAGE_PREFIX = "aurix-ai-chat:";
const MAX_PERSISTED_MESSAGES = 50;

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function AiAssistantPage() {
  const { data: summary, isLoading: accessLoading } = useTraderAccessSummary();
  const access = summary?.platformSubscription ?? EMPTY_PLATFORM_SUBSCRIPTION_ACCESS;

  if (accessLoading && !summary) {
    return (
      <WorkspacePage eyebrow="Assistant" title="Aurix AI Trading Assistant" description="Loading your platform access status.">
        <Panel>
          <p className="text-sm text-muted">Loading…</p>
        </Panel>
      </WorkspacePage>
    );
  }

  if (access.status !== "ACTIVE") {
    return (
      <WorkspacePage
        eyebrow="Assistant"
        title="Aurix AI Trading Assistant"
        description="Activate your platform subscription to unlock the AI trading assistant."
      >
        <PlatformSubscriptionLocked
          access={access}
          description="Activate the Aurix platform subscription to unlock the AI trading assistant, account-aware prompts, and chart analysis workflows."
        />
      </WorkspacePage>
    );
  }

  return <AiAssistantContent />;
}

function AiAssistantContent() {
  // ── Account context (for the selector + context cards) ─────────────────────
  const { data: accounts = [] } = useQuery<TraderAccountSummary[]>({
    queryKey: queryKeys.accounts,
    queryFn: async () => {
      const res = await fetch("/api/trading-accounts");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load accounts");
      return json.data;
    },
  });

  const [accountId, setAccountId] = useState<string>("");
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.accountId === accountId) ?? null,
    [accounts, accountId],
  );

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  // ── Persisted chat (per-user, browser localStorage) ─────────────────────────
  const [userId, setUserId] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  // Resolve the logged-in user, then restore their saved conversation.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        const json = await res.json();
        const id: string | null = json?.ok ? json.data.id : null;
        if (!active) return;
        setUserId(id);
        if (id) {
          const raw = localStorage.getItem(CHAT_STORAGE_PREFIX + id);
          if (raw) {
            const saved = JSON.parse(raw) as { messages?: ChatMessage[]; accountId?: string };
            if (Array.isArray(saved.messages)) setMessages(saved.messages);
            if (typeof saved.accountId === "string") setAccountId(saved.accountId);
          }
        }
      } catch {
        // ignore — fall back to an empty session
      } finally {
        if (active) hydratedRef.current = true;
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Persist on change (only after the initial restore, so we don't clobber it).
  useEffect(() => {
    if (!hydratedRef.current || !userId) return;
    try {
      localStorage.setItem(
        CHAT_STORAGE_PREFIX + userId,
        JSON.stringify({ messages: messages.slice(-MAX_PERSISTED_MESSAGES), accountId }),
      );
    } catch {
      // storage full / unavailable — non-fatal
    }
  }, [messages, accountId, userId]);

  function clearChat() {
    setMessages([]);
    setChatError(null);
    if (userId) {
      try {
        localStorage.removeItem(CHAT_STORAGE_PREFIX + userId);
      } catch {
        // ignore
      }
    }
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setChatError(null);
    setInput("");
    const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          pageContext: "ai-assistant",
          accountId: accountId || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setChatError(json.error?.message ?? "We couldn't get a response. Try again later.");
        return;
      }
      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: json.data.message }]);
      if (typeof json.data.usage?.requestsRemainingToday === "number") {
        setRemaining(json.data.usage.requestsRemainingToday);
      }
    } catch {
      setChatError("Network error. Please check your connection and try again.");
    } finally {
      setIsSending(false);
    }
  }

  // ── Chart analysis state ─────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [chartFile, setChartFile] = useState<File | null>(null);
  const [chartFocus, setChartFocus] = useState("");
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [chartResult, setChartResult] = useState<string | null>(null);
  const [chartRemaining, setChartRemaining] = useState<number | null>(null);

  const { data: creditsData } = useQuery<{ credits: number }>({
    queryKey: ["ai-credits"],
    queryFn: async () => {
      const res = await fetch("/api/ai/credits");
      const json = await res.json();
      if (!json.ok) throw new Error("credits unavailable");
      return json.data;
    },
    staleTime: 60_000,
  });

  function onPickFile(file: File | null) {
    setChartError(null);
    setChartResult(null);
    if (!file) {
      setChartFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setChartError("Unsupported image type. Use PNG, JPG, or WebP.");
      setChartFile(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setChartError("Chart image is too large. Max size is 5MB.");
      setChartFile(null);
      return;
    }
    setChartFile(file);
  }

  async function runChartAnalysis() {
    if (!chartFile || chartLoading) return;
    setChartError(null);
    setChartResult(null);
    setChartLoading(true);
    try {
      const form = new FormData();
      form.append("image", chartFile);
      if (chartFocus.trim()) form.append("prompt", chartFocus.trim());
      if (accountId) form.append("accountId", accountId);

      const res = await fetch("/api/ai/chart-analysis", { method: "POST", body: form });
      const json = await res.json();
      if (!json.ok) {
        setChartError(json.error?.message ?? "We couldn't analyze this chart right now.");
        return;
      }
      setChartResult(json.data.message);
      if (typeof json.data.usage?.requestsRemainingToday === "number") {
        setChartRemaining(json.data.usage.requestsRemainingToday);
      }
    } catch {
      setChartError("Network error. Please check your connection and try again.");
    } finally {
      setChartLoading(false);
    }
  }

  return (
    <WorkspacePage
      eyebrow="Assistant"
      title="Aurix AI Trading Assistant"
      description="Your built-in trading copilot. Ask about your account risk, performance, exposure, and upcoming news — grounded in your live Aurix data."
      action={
        <PageActionGroup>
          <div className="min-w-[220px]">
            <SelectField
              label="Account context"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">All my accounts</option>
              {accounts.map((a) => (
                <option key={a.accountId} value={a.accountId}>
                  {a.accountName} — {a.brokerName}
                </option>
              ))}
            </SelectField>
          </div>
        </PageActionGroup>
      }
    >
      <InlineStatusStrip
        items={[
          {
            label: "Account in context",
            value: selectedAccount ? selectedAccount.accountName : "All accounts",
            tone: "accent",
          },
          {
            label: "Account status",
            value: selectedAccount ? selectedAccount.status : `${accounts.length} connected`,
          },
          {
            label: "Chats left today",
            value: remaining === null ? "—" : remaining,
            tone: "lime",
          },
          {
            label: "Chart analyses left",
            value: chartRemaining === null ? "—" : chartRemaining,
            tone: "lime",
          },
          {
            label: "Token credits",
            value: creditsData ? creditsData.credits.toLocaleString() : "—",
            tone: creditsData && creditsData.credits < 5000 ? "danger" : "lime",
          },
        ]}
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        {/* ── Chat panel ─────────────────────────────────────────────── */}
        <Panel className="flex min-h-[520px] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-4">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Aurix Assistant</p>
                <p className="text-xs text-muted">Professional Forex &amp; prop-risk copilot</p>
              </div>
            </div>
            {messages.length > 0 ? (
              <GhostButton type="button" onClick={clearChat} disabled={isSending}>
                <Trash2 className="mr-2 inline-block h-4 w-4" />
                Clear
              </GhostButton>
            ) : null}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto py-4">
            {messages.length === 0 ? (
              <div className="py-6">
                <EmptyState
                  title="Ask your first question"
                  description="The assistant reads your live Aurix account data to answer. Try one of these:"
                />
                <div className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-2">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => sendMessage(p)}
                      className="btn-dark text-left"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-br-sm border border-accent/30 bg-accent/10 px-4 py-3 text-sm leading-6 text-foreground"
                        : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-line bg-background px-4 py-3 text-sm leading-6 text-foreground/90"
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {isSending ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking…
              </div>
            ) : null}
          </div>

          {chatError ? (
            <div className="mb-3 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
              {chatError}
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex items-end gap-2 border-t border-line pt-4"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Ask about your risk, performance, exposure, or upcoming news…"
              rows={2}
              maxLength={4000}
              className="min-h-[52px] w-full resize-none rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/10"
            />
            <PrimaryButton type="submit" disabled={isSending || input.trim().length === 0}>
              <Send className="mr-2 inline-block h-4 w-4" />
              Send
            </PrimaryButton>
          </form>
          <p className="mt-2 text-[11px] leading-5 text-muted">
            Educational analysis only — not financial advice. The assistant never guarantees profits.
          </p>
        </Panel>

        {/* ── Advanced chart analysis ────────────────────────────────── */}
        <Panel className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-line pb-4">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-2/10 text-accent-2">
              <ImagePlus className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Advanced Chart Analysis</p>
              <p className="text-xs text-muted">Upload a TradingView screenshot</p>
            </div>
          </div>

          <div className="space-y-4 py-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
              <GhostButton type="button" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="mr-2 inline-block h-4 w-4" />
                {chartFile ? "Change image" : "Choose image"}
              </GhostButton>
              {chartFile ? (
                <p className="mt-2 truncate text-xs text-muted">
                  {chartFile.name} · {(chartFile.size / 1024).toFixed(0)} KB
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted">PNG, JPG, or WebP · max 5MB</p>
              )}
            </div>

            <TextAreaField
              label="Focus (optional)"
              placeholder="e.g. Focus on the 15m structure and nearby liquidity."
              value={chartFocus}
              onChange={(e) => setChartFocus(e.target.value)}
              maxLength={1000}
            />

            {chartError ? (
              <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                {chartError}
              </div>
            ) : null}

            <PrimaryButton type="button" disabled={!chartFile || chartLoading} onClick={runChartAnalysis}>
              {chartLoading ? (
                <>
                  <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                "Analyze chart"
              )}
            </PrimaryButton>

            {chartResult ? (
              <div className="rounded-2xl border border-line bg-background px-4 py-4">
                <div className="mb-2 flex items-center gap-2">
                  <StatusPill tone="lime">Analysis</StatusPill>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{chartResult}</p>
              </div>
            ) : (
              <p className="text-[11px] leading-5 text-muted">
                Screenshot analysis lacks live order-book, spread, and execution context. It is educational only
                and not a guaranteed signal.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
