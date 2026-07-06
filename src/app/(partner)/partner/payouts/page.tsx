"use client";

import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  EmptyState,
  FilterChipRow,
  InlineStatusStrip,
  Panel,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { formatMoney } from "@/lib/utils/format";
import { useState } from "react";

type PayoutRow = {
  id: string;
  month: string;
  totalAmount: number;
  currency: string;
  status: string;
  paidAt: string | null;
  adminNote: string | null;
};

type CommissionRow = {
  id: string;
  commissionAmount: number;
  grossAmount: number;
  currency: string;
  status: string;
  payoutMonth: string | null;
  createdAt: string;
  traderName: string;
};

const STATUS_TONE: Record<string, "lime" | "accent" | "muted" | "danger"> = {
  PAID: "lime",
  APPROVED: "accent",
  DRAFT: "muted",
  PENDING: "accent",
  CANCELLED: "muted",
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data;
}

export default function PartnerPayoutsPage() {
  const [commissionFilter, setCommissionFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "PAID">("ALL");

  const { data: payoutsData, isLoading: payoutsLoading } = useQuery<{ payouts: PayoutRow[] }>({
    queryKey: ["partner-my-payouts"],
    queryFn: async () => {
      const res = await fetch("/api/partner/payouts");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed");
      return json.data;
    },
    staleTime: 60_000,
  });

  const { data: commissionsData } = useQuery<{ commissions: CommissionRow[] }>({
    queryKey: ["partner-my-commissions"],
    queryFn: async () => {
      const res = await fetch("/api/partner/commissions");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed");
      return json.data;
    },
    staleTime: 60_000,
  });

  const payouts = payoutsData?.payouts ?? [];
  const commissions = commissionsData?.commissions ?? [];

  const filteredCommissions =
    commissionFilter === "ALL" ? commissions : commissions.filter((c) => c.status === commissionFilter);

  const totalPaid = payouts.filter((p) => p.status === "PAID").reduce((s, p) => s + p.totalAmount, 0);
  const totalPending = commissions
    .filter((c) => c.status === "PENDING" || c.status === "APPROVED")
    .reduce((s, c) => s + c.commissionAmount, 0);

  return (
    <WorkspacePage
      eyebrow="Partner"
      title="Payouts"
      description="Your monthly commission payouts. Payouts are processed manually each month."
    >
      <InlineStatusStrip
        items={[
          { label: "Total paid out", value: formatMoney({ amount: totalPaid, currency: "USD" }), tone: "lime" },
          { label: "Pending payout", value: formatMoney({ amount: totalPending, currency: "USD" }), tone: "accent" },
          { label: "Payout records", value: payouts.length },
          { label: "Commission records", value: commissions.length },
        ]}
      />

      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-muted">
        Payouts are processed monthly by the admin team. Approved commissions are batched and paid each month.
        You will receive confirmation when a payout is marked as paid.
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        {/* Payout history */}
        <Panel>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Payout history</h2>
          {payoutsLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : payouts.length === 0 ? (
            <EmptyState title="No payouts yet" description="Payouts will appear here once processed." />
          ) : (
            <DataTable
              headers={["Month", "Amount", "Status", "Paid on"]}
              rows={payouts.map((p) => [
                <span key="m" className="font-mono text-sm">{p.month}</span>,
                <span key="a">{formatMoney({ amount: p.totalAmount, currency: p.currency })}</span>,
                <StatusPill key="s" tone={STATUS_TONE[p.status] ?? "muted"}>{p.status}</StatusPill>,
                <span key="d" className="text-xs text-muted">
                  {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}
                </span>,
              ])}
            />
          )}
        </Panel>

        {/* Commission ledger */}
        <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Commission ledger</h2>
            {commissions.length > 0 && (
              <FilterChipRow
                chips={(["ALL", "PENDING", "APPROVED", "PAID"] as const).map((s) => ({
                  label: s === "ALL" ? `All (${commissions.length})` : s,
                  active: commissionFilter === s,
                  onClick: () => setCommissionFilter(s),
                }))}
              />
            )}
          </div>
          {commissions.length === 0 ? (
            <EmptyState title="No commissions" description="Commission records appear when referred users make purchases." />
          ) : (
            <DataTable
              headers={["Trader", "Month", "Commission", "Status"]}
              rows={filteredCommissions.slice(0, 100).map((c) => [
                <span key="t" className="text-sm text-foreground">{c.traderName}</span>,
                <span key="m" className="font-mono text-xs">{c.payoutMonth ?? "—"}</span>,
                <span key="a">{formatMoney({ amount: c.commissionAmount, currency: c.currency })}</span>,
                <StatusPill key="s" tone={STATUS_TONE[c.status] ?? "muted"}>{c.status}</StatusPill>,
              ])}
            />
          )}
        </Panel>
      </div>
    </WorkspacePage>
  );
}
