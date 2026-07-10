"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 as CheckCircle, Clock } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, WorkspacePage } from "@/components/app/WorkspaceUI";

type BillingHistoryRow = {
  id: string;
  productName: string;
  status: string;
  amount: number;
  currency: string;
};

type BillingSummary = {
  paymentHistory: BillingHistoryRow[];
};

export default function BillingReturnPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const isMock = searchParams.get("mock") === "1";

  const confirmMockPayment = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/billing/mock-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to confirm mock payment");
      return json.data as { message: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-me"] });
    },
  });

  useEffect(() => {
    if (!isMock || !orderId || confirmMockPayment.isSuccess || confirmMockPayment.isPending) return;
    confirmMockPayment.mutate();
  }, [confirmMockPayment, isMock, orderId]);

  const { data, isLoading } = useQuery<BillingSummary>({
    queryKey: ["billing-return", orderId],
    queryFn: async () => {
      const res = await fetch("/api/billing/me");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load status");
      return json.data as BillingSummary;
    },
    refetchInterval: 5_000,
    enabled: Boolean(orderId),
  });

  const order = data?.paymentHistory?.find((item) => item.id === orderId);
  const isPaid = order?.status === "PAID";
  const isPending = order?.status === "PENDING" || !order;

  return (
    <WorkspacePage
      eyebrow="Billing"
      title="Payment status"
      description={isMock ? "Returned from the local mock checkout flow." : "Returned from Stripe Checkout."}
    >
      <Panel className="max-w-lg">
        {isLoading && !order ? (
          <div className="space-y-3 py-4">
            <div className="h-5 w-48 animate-pulse rounded-full bg-panel-strong" />
            <div className="h-4 w-64 animate-pulse rounded-full bg-panel-strong" />
          </div>
        ) : isPaid ? (
          <div className="flex items-start gap-4 py-2">
            <CheckCircle className="mt-0.5 h-7 w-7 shrink-0 text-lime" />
            <div>
              <p className="text-base font-semibold text-foreground">Payment confirmed</p>
              <p className="mt-1 text-sm text-muted">
                Your payment for <strong className="text-foreground">{order?.productName}</strong> was received.
                Access will unlock after admin approval, usually within 1 business day.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4 py-2">
            <Clock className="mt-0.5 h-7 w-7 shrink-0 text-accent" />
            <div>
              <p className="text-base font-semibold text-foreground">
                {isPending ? "Payment processing..." : "Payment not confirmed"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {isPending
                  ? isMock
                    ? "We are recording the mock payment locally. This page refreshes automatically."
                    : "We are waiting for Stripe to confirm your payment. This page refreshes automatically."
                  : `Current status: ${order?.status}. Contact support if you believe this is an error.`}
              </p>
              {confirmMockPayment.isError ? (
                <p className="mt-2 text-xs text-danger">{(confirmMockPayment.error as Error).message}</p>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-5 flex gap-3 border-t border-line pt-4">
          <Link
            href="/billing"
            className="rounded-full border border-line bg-background px-4 py-2 text-xs font-semibold text-foreground hover:border-accent/40"
          >
            Back to billing
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-background hover:opacity-90"
          >
            Go to dashboard
          </Link>
        </div>
      </Panel>
    </WorkspacePage>
  );
}
