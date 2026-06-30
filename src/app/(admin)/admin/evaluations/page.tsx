"use client";

import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DataTable,
  EmptyState,
  FilterChipRow,
  GhostButton,
  PageActionGroup,
  Panel,
  PrimaryButton,
  StatTile,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import type { EvaluationProgramDto, EvaluationAttemptDto } from "@/lib/services/evaluationService";
import type { CertificateDto } from "@/lib/services/certificateService";
import type { AcademyCourseDto } from "@/lib/domain/types";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data as T;
}

type Tab = "programs" | "attempts" | "certificates" | "analytics";

// "warning" isn't a valid tone — map it to "accent"
const STATUS_TONE: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  PUBLISHED: "lime",
  DRAFT: "accent",
  ARCHIVED: "muted",
  ACTIVE: "accent",
  PASSED: "lime",
  FAILED: "danger",
  EXPIRED: "danger",
  CANCELLED: "muted",
  NEEDS_REVIEW: "accent",
  PENDING: "muted",
  VALID: "lime",
  REVOKED: "danger",
};

const fieldCls = "h-10 w-full rounded-xl border border-line bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10";
const textareaCls = "min-h-20 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/10";
const selectCls = "h-10 w-full rounded-xl border border-line bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10";
const labelCls = "block text-xs font-semibold uppercase tracking-[0.18em] text-muted mb-1.5";
const numCls = `${fieldCls} [appearance:textfield]`;

// ── Create Program Dialog ─────────────────────────────────────
function CreateProgramDialog({ courses, onCreated }: { courses: AcademyCourseDto[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    slug: "", name: "", description: "",
    requiredCourseId: "",
    startingBalance: "10000",
    profitTargetPercent: "8",
    maxDailyDrawdownPercent: "5",
    maxOverallDrawdownPercent: "10",
    minimumTradingDays: "5",
    durationDays: "30",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/admin/evaluations/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: form.slug,
          name: form.name,
          description: form.description || undefined,
          requiredCourseId: form.requiredCourseId || undefined,
          startingBalance: Number(form.startingBalance),
          profitTargetPercent: Number(form.profitTargetPercent),
          maxDailyDrawdownPercent: Number(form.maxDailyDrawdownPercent),
          maxOverallDrawdownPercent: Number(form.maxOverallDrawdownPercent),
          minimumTradingDays: Number(form.minimumTradingDays),
          durationDays: Number(form.durationDays),
        }),
      }),
    onSuccess: () => { setOpen(false); onCreated(); setErr(""); },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <PrimaryButton><Plus className="mr-1.5 inline h-3.5 w-3.5" />New Program</PrimaryButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">New Evaluation Program</Dialog.Title>
            <Dialog.Close className="rounded-lg p-1 text-muted hover:text-foreground"><X className="h-4 w-4" /></Dialog.Close>
          </div>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); setErr(""); mutation.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Name</label>
                <input className={fieldCls} value={form.name} onChange={set("name")} placeholder="Aurix Funded Trader" required />
              </div>
              <div>
                <label className={labelCls}>Slug</label>
                <input className={fieldCls} value={form.slug} onChange={set("slug")} placeholder="aurix-funded-trader" required />
              </div>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea className={textareaCls} value={form.description} onChange={set("description")} placeholder="Optional description…" />
            </div>
            <div>
              <label className={labelCls}>Required Academy Course</label>
              <select className={selectCls} value={form.requiredCourseId} onChange={set("requiredCourseId")}>
                <option value="">None — open to all traders</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Starting Balance (USD)</label><input type="number" className={numCls} value={form.startingBalance} onChange={set("startingBalance")} min="100" required /></div>
              <div><label className={labelCls}>Profit Target (%)</label><input type="number" className={numCls} value={form.profitTargetPercent} onChange={set("profitTargetPercent")} min="0.1" max="100" step="0.1" required /></div>
              <div><label className={labelCls}>Max Daily DD (%)</label><input type="number" className={numCls} value={form.maxDailyDrawdownPercent} onChange={set("maxDailyDrawdownPercent")} min="0.1" max="100" step="0.1" required /></div>
              <div><label className={labelCls}>Max Overall DD (%)</label><input type="number" className={numCls} value={form.maxOverallDrawdownPercent} onChange={set("maxOverallDrawdownPercent")} min="0.1" max="100" step="0.1" required /></div>
              <div><label className={labelCls}>Min Trading Days</label><input type="number" className={numCls} value={form.minimumTradingDays} onChange={set("minimumTradingDays")} min="0" required /></div>
              <div><label className={labelCls}>Duration (Days)</label><input type="number" className={numCls} value={form.durationDays} onChange={set("durationDays")} min="1" required /></div>
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <GhostButton type="button" onClick={() => setOpen(false)}>Cancel</GhostButton>
              <PrimaryButton type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Creating…" : "Create Program"}</PrimaryButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Publish / Archive Dialog ──────────────────────────────────
function UpdateStatusDialog({ program, onUpdated }: { program: EvaluationProgramDto; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(program.status);
  const [err, setErr] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/evaluations/programs/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => { setOpen(false); onUpdated(); },
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="text-xs text-accent underline hover:opacity-80">Edit Status</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold">{program.name}</Dialog.Title>
            <Dialog.Close className="rounded-lg p-1 text-muted hover:text-foreground"><X className="h-4 w-4" /></Dialog.Close>
          </div>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Status</label>
              <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as EvaluationProgramDto["status"])}>
                <option value="DRAFT">DRAFT</option>
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex justify-end gap-3">
              <GhostButton type="button" onClick={() => setOpen(false)}>Cancel</GhostButton>
              <PrimaryButton type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save"}</PrimaryButton>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Link Account Dialog ───────────────────────────────────────
function LinkAccountDialog({ attempt, onLinked }: { attempt: EvaluationAttemptDto; onLinked: () => void }) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [err, setErr] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/evaluations/attempts/${attempt.id}/link-account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradingAccountId: accountId }),
      }),
    onSuccess: () => { setOpen(false); onLinked(); setErr(""); },
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="text-xs text-accent underline hover:opacity-80">Link Account</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold">Link Demo Account</Dialog.Title>
            <Dialog.Close className="rounded-lg p-1 text-muted hover:text-foreground"><X className="h-4 w-4" /></Dialog.Close>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">Enter the UUID of a connected trading account. Starting balance will be set from the program&apos;s configured value.</p>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Trading Account ID (UUID)</label>
              <input className={fieldCls} value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex justify-end gap-3">
              <GhostButton type="button" onClick={() => setOpen(false)}>Cancel</GhostButton>
              <PrimaryButton type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || !accountId}>{mutation.isPending ? "Linking…" : "Link Account"}</PrimaryButton>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Override Dialog ───────────────────────────────────────────
function OverrideDialog({ attempt, onOverridden }: { attempt: EvaluationAttemptDto; onOverridden: () => void }) {
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<"PASSED" | "FAILED" | "CANCELLED">("PASSED");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/evaluations/attempts/${attempt.id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus, reason }),
      }),
    onSuccess: () => { setOpen(false); onOverridden(); setErr(""); setReason(""); },
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="text-xs text-accent underline hover:opacity-80">Override</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold">Admin Override</Dialog.Title>
            <Dialog.Close className="rounded-lg p-1 text-muted hover:text-foreground"><X className="h-4 w-4" /></Dialog.Close>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">Override is audited. Reason required. Trader will be notified.</p>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>New Status</label>
              <select className={selectCls} value={newStatus} onChange={(e) => setNewStatus(e.target.value as typeof newStatus)}>
                <option value="PASSED">PASSED</option>
                <option value="FAILED">FAILED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Reason (required)</label>
              <textarea className={textareaCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the override reason…" />
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex justify-end gap-3">
              <GhostButton type="button" onClick={() => setOpen(false)}>Cancel</GhostButton>
              <PrimaryButton type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || reason.trim().length < 5}>{mutation.isPending ? "Applying…" : "Apply Override"}</PrimaryButton>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Revoke Certificate Dialog ─────────────────────────────────
function RevokeCertDialog({ cert, onRevoked }: { cert: CertificateDto; onRevoked: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/evaluations/certificates/${cert.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => { setOpen(false); onRevoked(); setErr(""); setReason(""); },
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="text-xs text-danger underline hover:opacity-80">Revoke</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold text-danger">Revoke Certificate</Dialog.Title>
            <Dialog.Close className="rounded-lg p-1 text-muted hover:text-foreground"><X className="h-4 w-4" /></Dialog.Close>
          </div>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Reason (required)</label>
              <textarea className={textareaCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for revocation…" />
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex justify-end gap-3">
              <GhostButton type="button" onClick={() => setOpen(false)}>Cancel</GhostButton>
              <PrimaryButton type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || reason.trim().length < 5}>{mutation.isPending ? "Revoking…" : "Confirm Revoke"}</PrimaryButton>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdminEvaluationsPage() {
  const [tab, setTab] = useState<Tab>("programs");
  const qc = useQueryClient();

  const { data: analytics } = useQuery<Record<string, unknown>>({
    queryKey: ["admin-eval-analytics"],
    queryFn: () => apiFetch("/api/admin/evaluations/analytics"),
  });

  const { data: programs = [], refetch: refetchPrograms } = useQuery<EvaluationProgramDto[]>({
    queryKey: ["admin-eval-programs"],
    queryFn: () => apiFetch("/api/admin/evaluations/programs"),
    enabled: tab === "programs",
  });

  const { data: attempts = [], refetch: refetchAttempts } = useQuery<EvaluationAttemptDto[]>({
    queryKey: ["admin-eval-attempts"],
    queryFn: () => apiFetch("/api/admin/evaluations/attempts"),
    enabled: tab === "attempts",
  });

  const { data: certs = [], refetch: refetchCerts } = useQuery<CertificateDto[]>({
    queryKey: ["admin-eval-certs"],
    queryFn: () => apiFetch("/api/admin/evaluations/certificates"),
    enabled: tab === "certificates",
  });

  const { data: courses = [] } = useQuery<AcademyCourseDto[]>({
    queryKey: ["admin-courses-for-eval"],
    queryFn: () => apiFetch("/api/admin/academy/courses"),
  });

  const checkMutation = useMutation({
    mutationFn: (attemptId: string) =>
      apiFetch(`/api/admin/evaluations/attempts/${attemptId}/check`, { method: "POST" }),
    onSuccess: () => refetchAttempts(),
  });

  const issueMutation = useMutation({
    mutationFn: (attemptId: string) =>
      apiFetch(`/api/evaluations/attempts/${attemptId}/certificate`, { method: "POST" }),
    onSuccess: () => { void refetchAttempts(); void refetchCerts(); },
  });

  const a = analytics as Record<string, unknown> | undefined;
  const tabs: Tab[] = ["programs", "attempts", "certificates", "analytics"];

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="Evaluation Programs"
      description="Manage evaluation challenges, review attempts, and issue certificates"
      action={
        tab === "programs" ? (
          <PageActionGroup>
            <CreateProgramDialog
              courses={courses}
              onCreated={() => { void refetchPrograms(); qc.invalidateQueries({ queryKey: ["admin-eval-analytics"] }); }}
            />
          </PageActionGroup>
        ) : undefined
      }
    >
      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Programs" value={String(a?.totalPrograms ?? "—")} />
        <StatTile label="Published" value={String(a?.publishedPrograms ?? "—")} />
        <StatTile label="Attempts" value={String(a?.totalAttempts ?? "—")} />
        <StatTile label="Certificates" value={String(a?.validCertificates ?? "—")} />
      </div>

      {/* Tabs */}
      <FilterChipRow
        chips={tabs.map((t) => ({
          label: t.charAt(0).toUpperCase() + t.slice(1),
          active: tab === t,
          onClick: () => setTab(t),
        }))}
      />

      <div className="mt-4">
        {/* Programs Tab */}
        {tab === "programs" && (
          programs.length === 0 ? (
            <EmptyState icon={undefined} title="No programs yet" description="Create your first evaluation program." />
          ) : (
            <DataTable
              headers={["Name", "Status", "Balance", "Target", "Duration", "Req. Course", "Actions"]}
              rows={programs.map((p) => [
                <span key="name" className="font-medium">{p.name}</span>,
                <StatusPill key="status" tone={STATUS_TONE[p.status] ?? "muted"}>{p.status}</StatusPill>,
                `$${p.startingBalance.toLocaleString()}`,
                `${p.profitTargetPercent}%`,
                `${p.durationDays}d / ${p.minimumTradingDays} days min`,
                p.requiredCourseName ?? "—",
                <UpdateStatusDialog key="action" program={p} onUpdated={refetchPrograms} />,
              ])}
            />
          )
        )}

        {/* Attempts Tab */}
        {tab === "attempts" && (
          attempts.length === 0 ? (
            <EmptyState icon={undefined} title="No attempts yet" description="Traders will appear here after starting an evaluation." />
          ) : (
            <DataTable
              headers={["Program", "Trader", "Status", "Account", "Last Checked", "Actions"]}
              rows={attempts.map((at) => [
                at.programName,
                at.userId.slice(0, 8) + "…",
                <StatusPill key="status" tone={STATUS_TONE[at.status] ?? "muted"}>{at.status}</StatusPill>,
                at.tradingAccountName ?? <span key="acct" className="text-xs text-muted-foreground">Not linked</span>,
                at.lastCheckedAt ? new Date(at.lastCheckedAt).toLocaleDateString() : "—",
                <div key="actions" className="flex flex-wrap items-center gap-2">
                  {!at.tradingAccountId && <LinkAccountDialog attempt={at} onLinked={refetchAttempts} />}
                  {at.status === "ACTIVE" && (
                    <button onClick={() => checkMutation.mutate(at.id)} disabled={checkMutation.isPending} className="text-xs text-accent underline hover:opacity-80 disabled:opacity-50">
                      {checkMutation.isPending ? "…" : "Run Check"}
                    </button>
                  )}
                  {at.status === "PASSED" && (
                    <button onClick={() => issueMutation.mutate(at.id)} disabled={issueMutation.isPending} className="text-xs text-lime-400 underline hover:opacity-80 disabled:opacity-50">
                      Issue Cert
                    </button>
                  )}
                  {["ACTIVE", "PENDING", "NEEDS_REVIEW"].includes(at.status) && (
                    <OverrideDialog attempt={at} onOverridden={refetchAttempts} />
                  )}
                </div>,
              ])}
            />
          )
        )}

        {/* Certificates Tab */}
        {tab === "certificates" && (
          certs.length === 0 ? (
            <EmptyState icon={undefined} title="No certificates" description="Certificates appear after passing attempts." />
          ) : (
            <DataTable
              headers={["Holder", "Program", "Verification ID", "Issued", "Status", "Actions"]}
              rows={certs.map((c) => [
                c.holderName,
                c.programName,
                <span key="vid" className="font-mono text-xs">{c.verificationId}</span>,
                new Date(c.issuedAt).toLocaleDateString(),
                <StatusPill key="status" tone={STATUS_TONE[c.status] ?? "muted"}>{c.status}</StatusPill>,
                c.status === "VALID" ? (
                  <RevokeCertDialog key="revoke" cert={c} onRevoked={refetchCerts} />
                ) : (
                  <span key="done" className="text-xs text-muted-foreground">Revoked</span>
                ),
              ])}
            />
          )
        )}

        {/* Analytics Tab */}
        {tab === "analytics" && (
          <div className="space-y-4">
            <Panel>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attempt Distribution</h2>
              {a?.attemptsByStatus ? (
                <div className="space-y-2">
                  {Object.entries(a.attemptsByStatus as Record<string, number>).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <StatusPill tone={STATUS_TONE[status] ?? "muted"}>{status}</StatusPill>
                      <span className="font-semibold text-foreground">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              )}
            </Panel>
            <Panel>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Certificates</h2>
              <div className="flex gap-8 text-sm">
                <div><span className="text-muted-foreground">Total: </span><strong>{String(a?.totalCertificates ?? 0)}</strong></div>
                <div><span className="text-muted-foreground">Valid: </span><strong className="text-lime-400">{String(a?.validCertificates ?? 0)}</strong></div>
                <div><span className="text-muted-foreground">Revoked: </span><strong className="text-danger">{String(Number(a?.totalCertificates ?? 0) - Number(a?.validCertificates ?? 0))}</strong></div>
              </div>
            </Panel>
          </div>
        )}
      </div>
    </WorkspacePage>
  );
}
