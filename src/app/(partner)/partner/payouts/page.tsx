"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, EmptyState, InlineStatusStrip, Panel, PrimaryButton, StatusPill, WorkspacePage } from "@/components/app/WorkspaceUI";
import { formatMoney } from "@/lib/utils/format";
import type { PartnerWithdrawalBalanceDto, PartnerWithdrawalDto } from "@/lib/partner/withdrawals";

type WithdrawalResponse = { balance: PartnerWithdrawalBalanceDto; withdrawals: PartnerWithdrawalDto[] };
const TONES: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  PENDING_REVIEW: "accent", APPROVED: "lime", PAID: "lime", REJECTED: "danger",
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = await response.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data as T;
}

export default function PartnerPayoutsPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { data, isLoading } = useQuery<WithdrawalResponse>({
    queryKey: ["partner-withdrawals"],
    queryFn: () => getJson("/api/partner/withdrawals"),
  });
  const createRequest = useMutation({
    mutationFn: (input: Record<string, unknown>) => getJson("/api/partner/withdrawals", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    }),
    onSuccess: () => {
      setError("");
      setMessage("Withdrawal request submitted for admin review.");
      void queryClient.invalidateQueries({ queryKey: ["partner-withdrawals"] });
    },
    onError: (mutationError: Error) => { setMessage(""); setError(mutationError.message); },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createRequest.mutate({
      amount: Number(form.get("amount")), currency: "USD",
      payoutMethod: form.get("payoutMethod"), payoutReference: form.get("payoutReference"), requestedNote: form.get("requestedNote"),
    });
  }

  const balance = data?.balance;
  const withdrawals = data?.withdrawals ?? [];
  const hasActive = withdrawals.some((row) => row.status === "PENDING_REVIEW" || row.status === "APPROVED");

  return (
    <WorkspacePage eyebrow="Partner" title="Withdrawals" description="Request payment from approved commission balance and track every review step.">
      <InlineStatusStrip items={[
        { label: "Approved commissions", value: balance ? formatMoney({ amount: balance.approved, currency: balance.currency }) : "…", tone: "lime" },
        { label: "Reserved", value: balance ? formatMoney({ amount: balance.reserved, currency: balance.currency }) : "…", tone: "accent" },
        { label: "Available", value: balance ? formatMoney({ amount: balance.available, currency: balance.currency }) : "…", tone: "lime" },
        { label: "Minimum", value: balance ? formatMoney({ amount: balance.minimum, currency: balance.currency }) : "…" },
      ]} />

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel>
          <h2 className="text-lg font-semibold text-foreground">Request withdrawal</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Only approved, unreserved commissions are withdrawable. One active request is allowed at a time.</p>
          {message ? <p className="mt-4 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent">{message}</p> : null}
          {error ? <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}
          <form onSubmit={submit} className="mt-5 grid gap-4">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Amount (USD)
              <input name="amount" type="number" min={balance?.minimum ?? 100} max={balance?.available ?? 0} step="0.01" required defaultValue={balance?.available || ""} disabled={hasActive} className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Payout method
              <input name="payoutMethod" required maxLength={80} placeholder="Bank transfer, USDT, etc." disabled={hasActive} className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Payout reference
              <input name="payoutReference" required maxLength={240} placeholder="Account, wallet, or payment reference" disabled={hasActive} className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Note (optional)
              <textarea name="requestedNote" maxLength={1000} rows={3} disabled={hasActive} className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground" />
            </label>
            <PrimaryButton type="submit" disabled={createRequest.isPending || hasActive || !balance || balance.available < balance.minimum}>
              {createRequest.isPending ? "Submitting…" : hasActive ? "Active request in review" : "Submit withdrawal"}
            </PrimaryButton>
          </form>
        </Panel>

        <Panel>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Request history</h2>
          {isLoading ? <p className="text-sm text-muted">Loading…</p> : withdrawals.length === 0 ? (
            <EmptyState title="No withdrawal requests" description="Your submitted requests will appear here." />
          ) : (
            <DataTable headers={["Requested", "Amount", "Method", "Status", "Review"]} rows={withdrawals.map((row) => [
              <span key="d" className="text-xs text-muted">{new Date(row.createdAt).toLocaleDateString()}</span>,
              <span key="a">{formatMoney({ amount: row.amount, currency: row.currency })}</span>,
              <span key="m" className="text-sm text-foreground">{row.payoutMethod}</span>,
              <StatusPill key="s" tone={TONES[row.status] ?? "muted"}>{row.status.replaceAll("_", " ")}</StatusPill>,
              <span key="r" className="max-w-[220px] text-xs text-muted">{row.rejectionReason ?? row.adminNote ?? (row.paidAt ? `Paid ${new Date(row.paidAt).toLocaleDateString()}` : "-")}</span>,
            ])} />
          )}
        </Panel>
      </div>
    </WorkspacePage>
  );
}
