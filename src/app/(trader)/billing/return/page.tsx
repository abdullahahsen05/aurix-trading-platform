"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 as CheckCircle, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Panel, WorkspacePage } from "@/components/app/WorkspaceUI";

export default function BillingReturnPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  // Poll the billing summary to determine actual payment status
  const { data, isLoading } = useQuery({
    queryKey: ["billing-return", orderId],
    queryFn: async () => {
      const res = await fetch("/api/billing/me");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load status");
      return json.data;
    },
    refetchInterval: 5_000,
    enabled: Boolean(orderId),
  });

  // Find the relevant order in payment history
  const order = data?.paymentHistory?.find(
    (h: { id: string }) => h.id === orderId,
  ) as { productName: string; status: string; amount: number; currency: string } | undefined;

  const isPaid = order?.status === "PAID";
  const isPending = order?.status === "PENDING" || !order;

  return (
    <WorkspacePage
      eyebrow="Billing"
      title="Payment status"
      description="Redirected back from the Airwallex checkout."
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
                Your payment for <strong className="text-foreground">{order?.productName}</strong> was
                received. Access will be activated once an admin reviews and approves it — usually
                within 1 business day.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4 py-2">
            <Clock className="mt-0.5 h-7 w-7 shrink-0 text-accent" />
            <div>
              <p className="text-base font-semibold text-foreground">
                {isPending ? "Payment processing…" : "Payment not confirmed"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {isPending
                  ? "We are waiting for Airwallex to confirm payment. This page refreshes automatically."
                  : `Current status: ${order?.status}. Contact support if you believe this is an error.`}
              </p>
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
