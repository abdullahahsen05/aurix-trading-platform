"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Panel, StatusPill, WorkspacePage } from "@/components/app/WorkspaceUI";
import type { EvaluationAttemptDto } from "@/lib/services/evaluationService";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? json.error?.code ?? "Request failed");
  return json.data as T;
}

const STATUS_TONE: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  PENDING: "muted",
  ACTIVE: "accent",
  PASSED: "lime",
  FAILED: "danger",
  EXPIRED: "danger",
  CANCELLED: "muted",
  NEEDS_REVIEW: "accent",
};

function MetricRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "pass" | "fail" | null;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          highlight === "pass"
            ? "font-semibold text-lime-400"
            : highlight === "fail"
              ? "font-semibold text-danger"
              : "font-medium text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

interface StoredMetrics {
  profitPercent?: number;
  currentBalance?: number;
  currentEquity?: number;
  maxDrawdownPercent?: number;
  maxDailyDrawdownPercent?: number;
  tradingDays?: number;
  totalTrades?: number;
  daysRemaining?: number;
}

export default function AttemptDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = use(params);
  const qc = useQueryClient();

  const {
    data: attempt,
    isLoading,
    isError,
    error,
  } = useQuery<EvaluationAttemptDto>({
    queryKey: ["evaluation-attempt", attemptId],
    queryFn: () => apiFetch(`/api/evaluations/attempts/${attemptId}`),
  });

  const certMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/evaluations/attempts/${attemptId}/certificate`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-certificates"] });
    },
  });

  if (isLoading) {
    return (
      <WorkspacePage eyebrow="Evaluation" title="Attempt Detail" description="Loading your attempt…">
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      </WorkspacePage>
    );
  }

  if (isError || !attempt) {
    return (
      <WorkspacePage eyebrow="Evaluation" title="Attempt Detail" description="Unable to load attempt">
        <div className="py-16 text-center text-sm text-danger">
          {(error as Error | null)?.message ?? "Attempt not found"}
        </div>
      </WorkspacePage>
    );
  }

  const metrics = attempt.latestMetrics as StoredMetrics;
  const hasMetrics = typeof metrics?.profitPercent === "number";

  return (
    <WorkspacePage
      eyebrow="Evaluation"
      title={attempt.programName}
      description={`Attempt started ${attempt.startedAt ? new Date(attempt.startedAt).toLocaleDateString() : "—"}`}
      action={
        <Link href="/evaluations" className="text-sm text-muted-foreground hover:text-foreground">
          ‹ All Evaluations
        </Link>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <StatusPill tone={STATUS_TONE[attempt.status] ?? "muted"}>{attempt.status}</StatusPill>
        {attempt.adminOverrideBy && (
          <span className="text-xs text-muted-foreground">(Admin override)</span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Account */}
        <Panel>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Account
          </h2>
          <MetricRow
            label="Demo account"
            value={attempt.tradingAccountName ?? "Pending — admin will link an account"}
            highlight={attempt.tradingAccountName ? null : "fail"}
          />
          <MetricRow
            label="Starting balance"
            value={attempt.startingBalance != null ? `$${attempt.startingBalance.toLocaleString()}` : "—"}
          />
          <MetricRow
            label="Ends"
            value={attempt.endsAt ? new Date(attempt.endsAt).toLocaleDateString() : "—"}
          />
          {hasMetrics && metrics.daysRemaining !== undefined && (
            <MetricRow label="Days remaining" value={String(metrics.daysRemaining)} />
          )}
          {attempt.lastCheckedAt && (
            <MetricRow label="Last checked" value={new Date(attempt.lastCheckedAt).toLocaleString()} />
          )}
        </Panel>

        {/* Metrics */}
        {hasMetrics ? (
          <Panel>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Performance
            </h2>
            {metrics.currentBalance !== undefined && (
              <MetricRow
                label="Current balance"
                value={`$${metrics.currentBalance.toLocaleString()}`}
              />
            )}
            {metrics.profitPercent !== undefined && (
              <MetricRow
                label="Profit"
                value={`${metrics.profitPercent >= 0 ? "+" : ""}${metrics.profitPercent.toFixed(2)}%`}
                highlight={metrics.profitPercent >= 0 ? "pass" : null}
              />
            )}
            {metrics.maxDailyDrawdownPercent !== undefined && (
              <MetricRow
                label="Max daily drawdown"
                value={`${metrics.maxDailyDrawdownPercent.toFixed(2)}%`}
                highlight={metrics.maxDailyDrawdownPercent > 0 ? "fail" : null}
              />
            )}
            {metrics.maxDrawdownPercent !== undefined && (
              <MetricRow
                label="Max overall drawdown"
                value={`${metrics.maxDrawdownPercent.toFixed(2)}%`}
                highlight={metrics.maxDrawdownPercent > 0 ? "fail" : null}
              />
            )}
            {metrics.tradingDays !== undefined && (
              <MetricRow label="Trading days" value={String(metrics.tradingDays)} />
            )}
            {metrics.totalTrades !== undefined && (
              <MetricRow label="Total trades" value={String(metrics.totalTrades)} />
            )}
          </Panel>
        ) : (
          <Panel>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Performance
            </h2>
            <p className="text-sm text-muted-foreground">
              {attempt.tradingAccountName
                ? "No sync data yet — account will be checked by admin or worker."
                : "Link a demo account first, then run an evaluation check."}
            </p>
          </Panel>
        )}
      </div>

      {/* Pass/fail reason */}
      {(attempt.passReason ?? attempt.failReason) && (
        <Panel className="mt-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {attempt.passReason ? "Pass Reason" : "Fail Reason"}
          </h2>
          <p className="text-sm text-foreground">{attempt.passReason ?? attempt.failReason}</p>
          {attempt.adminOverrideReason && (
            <p className="mt-1 text-xs text-muted-foreground">
              Admin note: {attempt.adminOverrideReason}
            </p>
          )}
        </Panel>
      )}

      {/* Certificate */}
      {attempt.status === "PASSED" && (
        <Panel className="mt-4 border-lime-400/30 bg-lime-950/10">
          <h2 className="mb-2 text-sm font-semibold text-lime-400">Evaluation Passed</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            You can now claim your verified certificate.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => certMutation.mutate()}
              disabled={certMutation.isPending || certMutation.isSuccess}
              className="rounded-md bg-lime-500 px-4 py-1.5 text-xs font-semibold text-black hover:bg-lime-400 disabled:opacity-60"
            >
              {certMutation.isPending
                ? "Issuing…"
                : certMutation.isSuccess
                  ? "Certificate Issued"
                  : "Issue Certificate"}
            </button>
            <Link
              href="/evaluations/certificates"
              className="rounded-md border border-lime-400/30 px-4 py-1.5 text-xs font-medium text-lime-400 hover:bg-lime-400/10"
            >
              My Certificates
            </Link>
          </div>
          {certMutation.isError && (
            <p className="mt-2 text-xs text-danger">
              {(certMutation.error as Error).message}
            </p>
          )}
        </Panel>
      )}
    </WorkspacePage>
  );
}
