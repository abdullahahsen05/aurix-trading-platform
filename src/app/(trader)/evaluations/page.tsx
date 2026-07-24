"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EmptyState, Panel, StatusPill, WorkspacePage } from "@/components/app/WorkspaceUI";
import type { ProgramWithStatusDto } from "@/lib/services/evaluationService";

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

export default function EvaluationsPage() {
  const qc = useQueryClient();

  const { data: programs = [], isLoading, isError, error } = useQuery<ProgramWithStatusDto[]>({
    queryKey: ["evaluations-programs"],
    queryFn: () => apiFetch("/api/evaluations/programs"),
  });

  const startMutation = useMutation({
    mutationFn: (programId: string) =>
      apiFetch(`/api/evaluations/programs/${programId}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evaluations-programs"] });
      qc.invalidateQueries({ queryKey: ["evaluations-attempts"] });
    },
  });

  return (
    <WorkspacePage
      eyebrow="Certification"
      title="Evaluation Programs"
      description="Complete academy requirements and challenge yourself with a funded trader evaluation"
    >
      {isLoading && (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading programs…</div>
      )}
      {isError && (
        <div className="py-16 text-center text-sm text-danger">{(error as Error).message}</div>
      )}
      {!isLoading && !isError && programs.length === 0 && (
        <EmptyState
          icon={undefined}
          title="No evaluation programs available"
          description="Check back later — programs will appear here when published by an admin."
        />
      )}

      <div className="space-y-4">
        {programs.map((prog) => {
          const hasAttempt = prog.attemptId !== null;
          const locked = !prog.isUnlocked;
          const attemptStatus = prog.attemptStatus;

          return (
            <Panel key={prog.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{prog.name}</h3>
                    {locked && (
                      <span className="rounded-[4px] bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Locked
                      </span>
                    )}
                    {attemptStatus && (
                      <StatusPill tone={STATUS_TONE[attemptStatus] ?? "muted"}>
                        {attemptStatus}
                      </StatusPill>
                    )}
                  </div>

                  {prog.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{prog.description}</p>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3 lg:grid-cols-5">
                    <span>Balance: <strong className="text-foreground">${prog.startingBalance.toLocaleString()}</strong></span>
                    <span>Target: <strong className="text-foreground">{prog.profitTargetPercent}%</strong></span>
                    <span>Max daily DD: <strong className="text-foreground">{prog.maxDailyDrawdownPercent}%</strong></span>
                    <span>Max DD: <strong className="text-foreground">{prog.maxOverallDrawdownPercent}%</strong></span>
                    <span>Min days: <strong className="text-foreground">{prog.minimumTradingDays}</strong></span>
                    <span>Duration: <strong className="text-foreground">{prog.durationDays} days</strong></span>
                  </div>

                  {prog.requiredCourseId && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Requires:{" "}
                      <Link href="/academy" className="underline hover:text-foreground">
                        {prog.requiredCourseName ?? "Academy Course"}
                      </Link>
                      {prog.academyProgressPercent !== null && (
                        <span className="ml-2">({prog.academyProgressPercent}% complete)</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-start gap-2">
                  {hasAttempt && prog.attemptId ? (
                    <Link
                      href={`/evaluations/${prog.attemptId}`}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90"
                    >
                      View Attempt
                    </Link>
                  ) : locked ? (
                    <button
                      disabled
                      className="cursor-not-allowed rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                    >
                      Complete Academy First
                    </button>
                  ) : (
                    <button
                      onClick={() => startMutation.mutate(prog.id)}
                      disabled={startMutation.isPending}
                      className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-60"
                    >
                      {startMutation.isPending ? "Starting…" : "Start Evaluation"}
                    </button>
                  )}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      {startMutation.isError && (
        <p className="mt-4 text-center text-xs text-danger">
          {(startMutation.error as Error).message}
        </p>
      )}

      <div className="mt-6 flex justify-end">
        <Link href="/evaluations/certificates" className="text-xs text-muted-foreground underline hover:text-foreground">
          My Certificates
        </Link>
      </div>
    </WorkspacePage>
  );
}
