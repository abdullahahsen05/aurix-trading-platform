"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, CheckCircle2 as CheckCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DataTable,
  EmptyState,
  FilterChipRow,
  GhostButton,
  InlineStatusStrip,
  Panel,
  PrimaryButton,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { formatMoney } from "@/lib/utils/format";

type Purchase = {
  id: string;
  userName: string;
  userEmail: string;
  productName: string;
  productType: string;
  amount: number;
  currency: string;
  status: string;
  intentId: string | null;
  createdAt: string;
  paidAt: string | null;
};

const STATUS_TONE: Record<string, "lime" | "accent" | "muted" | "danger"> = {
  PAID: "lime",
  PENDING: "accent",
  FAILED: "danger",
  CANCELLED: "muted",
  REFUNDED: "muted",
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data;
}

export default function AdminBillingPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PAID" | "PENDING" | "FAILED" | "CANCELLED">("ALL");
  const [approveTarget, setApproveTarget] = useState<Purchase | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(""), 6000);
    return () => clearTimeout(t);
  }, [successMessage]);

  const { data, isLoading, refetch } = useQuery<{ purchases: Purchase[] }>({
    queryKey: ["admin-billing-purchases"],
    queryFn: () => getJson("/api/admin/billing/purchases"),
    staleTime: 30_000,
  });

  const purchases = data?.purchases ?? [];
  const filtered = statusFilter === "ALL" ? purchases : purchases.filter((p) => p.status === statusFilter);

  const counts = {
    ALL: purchases.length,
    PAID: purchases.filter((p) => p.status === "PAID").length,
    PENDING: purchases.filter((p) => p.status === "PENDING").length,
    FAILED: purchases.filter((p) => p.status === "FAILED").length,
    CANCELLED: purchases.filter((p) => p.status === "CANCELLED").length,
  };

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/billing/purchases/${id}/approve-access`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Approval failed");
      return json.data;
    },
    onSuccess: () => {
      setApproveTarget(null);
      setSuccessMessage("Access approved successfully.");
      qc.invalidateQueries({ queryKey: ["admin-billing-purchases"] });
    },
  });

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="Billing & Payments"
      description="Review payments, approve access, and manage subscriptions."
    >
      {successMessage && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-lime/20 bg-lime/10 px-4 py-3 text-sm font-medium text-lime">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {successMessage}
        </div>
      )}

      <InlineStatusStrip
        items={[
          { label: "Total purchases", value: counts.ALL },
          { label: "Paid", value: counts.PAID, tone: "lime" },
          { label: "Pending", value: counts.PENDING, tone: "accent" },
          { label: "Failed", value: counts.FAILED, tone: counts.FAILED > 0 ? "danger" : undefined },
        ]}
      />

      <Panel className="mt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Payment orders</h2>
          <div className="flex items-center gap-3">
            <FilterChipRow
              chips={(["ALL", "PAID", "PENDING", "FAILED", "CANCELLED"] as const).map((s) => ({
                label: `${s} (${counts[s]})`,
                active: statusFilter === s,
                onClick: () => setStatusFilter(s),
              }))}
            />
            <GhostButton type="button" onClick={() => refetch()}>
              Refresh
            </GhostButton>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="No purchases" description="No payment orders match the selected filter." />
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">Showing {filtered.length} of {purchases.length}</p>
            <DataTable
              headers={["User", "Product", "Amount", "Status", "Intent ID", "Date", "Action"]}
              rows={filtered.map((p) => [
                <div key="u" className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{p.userName}</p>
                  <p className="truncate text-xs text-muted">{p.userEmail}</p>
                </div>,
                <div key="pr">
                  <p className="text-sm text-foreground">{p.productName}</p>
                  <p className="text-xs text-muted">{p.productType}</p>
                </div>,
                <span key="a">{formatMoney({ amount: p.amount, currency: p.currency })}</span>,
                <StatusPill key="s" tone={STATUS_TONE[p.status] ?? "muted"}>{p.status}</StatusPill>,
                <span key="i" className="font-mono text-xs text-muted">
                  {p.intentId ? p.intentId.slice(0, 16) + "…" : "—"}
                </span>,
                <span key="d" className="text-xs text-muted">
                  {new Date(p.createdAt).toLocaleDateString()}
                </span>,
                p.status === "PAID" ? (
                  <GhostButton
                    key="act"
                    type="button"
                    onClick={() => setApproveTarget(p)}
                  >
                    Approve access
                  </GhostButton>
                ) : (
                  <span key="act" className="text-xs text-muted">—</span>
                ),
              ])}
            />
          </>
        )}
      </Panel>

      {/* Approve access confirmation */}
      <Dialog.Root open={Boolean(approveTarget)} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-lime/30 bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
            <Dialog.Title className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <CheckCircle className="h-5 w-5 text-lime" />
              Approve access
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              This will activate access for{" "}
              <strong className="text-foreground">{approveTarget?.userName}</strong> for{" "}
              <strong className="text-foreground">{approveTarget?.productName}</strong>.
              {" "}This action is logged in the audit trail.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
              <Dialog.Close asChild>
                <GhostButton type="button">Cancel</GhostButton>
              </Dialog.Close>
              <PrimaryButton
                type="button"
                disabled={approve.isPending}
                onClick={() => approveTarget && approve.mutate(approveTarget.id)}
              >
                {approve.isPending ? "Approving…" : "Confirm & approve"}
              </PrimaryButton>
            </div>
            {approve.isError && (
              <p className="mt-3 text-xs text-danger">
                {(approve.error as Error).message}
              </p>
            )}
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
  );
}
