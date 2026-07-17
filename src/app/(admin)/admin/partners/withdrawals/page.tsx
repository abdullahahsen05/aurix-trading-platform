"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, EmptyState, FilterChipRow, GhostButton, Panel, PrimaryButton, StatusPill, WorkspacePage } from "@/components/app/WorkspaceUI";
import { formatMoney } from "@/lib/utils/format";
import type { PartnerWithdrawalDto, PartnerWithdrawalStatus } from "@/lib/partner/withdrawals";

const TONES: Record<string, "lime" | "accent" | "danger" | "muted"> = { PENDING_REVIEW: "accent", APPROVED: "lime", PAID: "lime", REJECTED: "danger" };
async function getJson<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const json = await response.json(); if (!json.ok) throw new Error(json.error?.message ?? "Request failed"); return json.data as T; }

export default function AdminPartnerWithdrawalsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"ALL" | PartnerWithdrawalStatus>("ALL");
  const [selectedId, setSelectedId] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [error, setError] = useState("");
  const { data, isLoading } = useQuery<{ withdrawals: PartnerWithdrawalDto[] }>({ queryKey: ["admin-withdrawals", filter], queryFn: () => getJson(`/api/admin/partners/withdrawals${filter === "ALL" ? "" : `?status=${filter}`}`) });
  const action = useMutation({
    mutationFn: (name: "approve" | "reject" | "mark-paid") => getJson(`/api/admin/partners/withdrawals/${selectedId}/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminNote, rejectionReason }) }),
    onSuccess: () => { setError(""); setSelectedId(""); setAdminNote(""); setRejectionReason(""); void queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] }); },
    onError: (actionError: Error) => setError(actionError.message),
  });
  const rows = data?.withdrawals ?? [];
  const selected = rows.find((row) => row.id === selectedId);

  return (
    <WorkspacePage eyebrow="Admin · Partners" title="Withdrawal requests" description="Review, approve, reject, and reconcile partner withdrawals.">
      <FilterChipRow chips={(["ALL", "PENDING_REVIEW", "APPROVED", "PAID", "REJECTED"] as const).map((status) => ({ label: status.replaceAll("_", " "), active: filter === status, onClick: () => setFilter(status) }))} />
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <Panel>
          {isLoading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? <EmptyState title="No requests" description="No withdrawal requests match this filter." /> : (
            <DataTable headers={["Partner", "Amount", "Method", "Status", ""]} rows={rows.map((row) => [
              <div key="p"><p className="text-sm font-semibold text-foreground">{row.partnerName ?? "Partner"}</p><p className="text-xs text-muted">{row.partnerEmail}</p></div>,
              <span key="a">{formatMoney({ amount: row.amount, currency: row.currency })}</span>,
              <span key="m" className="text-xs text-muted">{row.payoutMethod}</span>,
              <StatusPill key="s" tone={TONES[row.status] ?? "muted"}>{row.status.replaceAll("_", " ")}</StatusPill>,
              <GhostButton key="b" type="button" onClick={() => { setSelectedId(row.id); setError(""); }}>Review</GhostButton>,
            ])} />
          )}
        </Panel>
        <Panel>
          <h2 className="text-lg font-semibold text-foreground">Review request</h2>
          {!selected ? <p className="mt-3 text-sm text-muted">Select a request to review its payout reference and available actions.</p> : (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-line bg-background p-4 text-sm"><p className="font-semibold text-foreground">{selected.payoutMethod}</p><p className="mt-1 break-all text-muted">{selected.payoutReference}</p><p className="mt-2 text-xs text-muted">Requested {new Date(selected.createdAt).toLocaleString()}</p></div>
              <textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} maxLength={1000} rows={3} placeholder="Admin note (optional)" className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground" />
              {(selected.status === "PENDING_REVIEW" || selected.status === "APPROVED") ? <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={1000} rows={2} placeholder="Rejection reason (required only to reject)" className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground" /> : null}
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <div className="flex flex-wrap gap-2">
                {selected.status === "PENDING_REVIEW" ? <PrimaryButton type="button" disabled={action.isPending} onClick={() => action.mutate("approve")}>Approve</PrimaryButton> : null}
                {selected.status === "APPROVED" ? <PrimaryButton type="button" disabled={action.isPending} onClick={() => action.mutate("mark-paid")}>Mark paid</PrimaryButton> : null}
                {(selected.status === "PENDING_REVIEW" || selected.status === "APPROVED") ? <GhostButton type="button" disabled={action.isPending || rejectionReason.trim().length < 3} onClick={() => action.mutate("reject")}>Reject</GhostButton> : null}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </WorkspacePage>
  );
}
