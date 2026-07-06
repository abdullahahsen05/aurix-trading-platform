"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, CheckCircle2 as CheckCircle, Clock, BadgeDollarSign as CreditCard, X, TrendingUp as ExternalLink } from "lucide-react";
import { useState } from "react";
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
import { SelectField } from "@/components/app/FormFields";
import { formatMoney } from "@/lib/utils/format";
import type { UserBillingSummaryDto, BillingProductDto } from "@/lib/services/billingService";
import type { TraderAccountSummary } from "@/lib/domain/types";

const STATUS_TONE: Record<string, "lime" | "accent" | "muted" | "danger"> = {
  ACTIVE: "lime",
  PENDING_APPROVAL: "accent",
  PENDING_PAYMENT: "muted",
  EXPIRED: "danger",
  CANCELLED: "muted",
  PAID: "lime",
  PENDING: "accent",
  FAILED: "danger",
  REFUNDED: "muted",
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data;
}

export default function BillingPage() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<BillingProductDto | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"ALL" | "PAID" | "PENDING" | "FAILED">("ALL");

  const { data: summary, isLoading } = useQuery<UserBillingSummaryDto>({
    queryKey: ["billing-me"],
    queryFn: () => getJson("/api/billing/me"),
    staleTime: 30_000,
  });

  const { data: products = [] } = useQuery<BillingProductDto[]>({
    queryKey: ["billing-products"],
    queryFn: () => getJson("/api/billing/products"),
    staleTime: 5 * 60_000,
  });

  const { data: accounts = [] } = useQuery<TraderAccountSummary[]>({
    queryKey: ["trading-accounts"],
    queryFn: () => getJson("/api/trading-accounts"),
    staleTime: 60_000,
  });

  const checkout = useMutation({
    mutationFn: async (product: BillingProductDto) => {
      const body: Record<string, string> = { productCode: product.code };
      if (product.type === "COPY_ACCOUNT") {
        if (!selectedAccountId) throw new Error("Select an account first");
        body.tradingAccountId = selectedAccountId;
        body.tier = product.code === "COPY_ULTRA_FAST" ? "PREMIUM" : "NORMAL";
      }
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Checkout failed");
      return json.data as { orderId: string; checkoutUrl: string };
    },
    onSuccess: (data) => {
      setCheckoutProduct(null);
      // Redirect to Airwallex hosted checkout
      window.location.href = data.checkoutUrl;
    },
    onError: (err: Error) => {
      setNotice({ type: "error", text: err.message });
      setCheckoutProduct(null);
    },
  });

  const platformSub = summary?.platformSubscription;
  const copyEntitlements = summary?.copyEntitlements ?? [];
  const paymentHistory = summary?.paymentHistory ?? [];
  const pendingApprovals = summary?.pendingApprovals ?? [];

  const paidHistory = historyFilter === "ALL"
    ? paymentHistory
    : paymentHistory.filter((h) => h.status === historyFilter);

  const paidProducts = products.filter((p) => p.billingInterval !== "FREE");
  const subscriptionProduct = paidProducts.find((p) => p.type === "SUBSCRIPTION");
  const copyProducts = paidProducts.filter((p) => p.type === "COPY_ACCOUNT");
  const botProduct = paidProducts.find((p) => p.type === "BOT");
  const mentorshipProduct = paidProducts.find((p) => p.type === "MENTORSHIP");

  return (
    <WorkspacePage
      eyebrow="Account"
      title="Billing & Access"
      description="Manage your platform subscription, copy-trading entitlements, and payment history."
    >
      {notice && (
        <div
          className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-medium ${
            notice.type === "success"
              ? "border-accent/20 bg-accent/10 text-accent"
              : "border-danger/20 bg-danger/10 text-danger"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Platform subscription status */}
      <InlineStatusStrip
        items={[
          {
            label: "Platform subscription",
            value: isLoading ? "…" : (platformSub?.status ?? "None"),
            tone: platformSub?.status === "ACTIVE"
              ? "lime"
              : platformSub?.status === "PENDING_APPROVAL"
                ? "accent"
                : "danger",
          },
          {
            label: "Copy entitlements",
            value: copyEntitlements.filter((e) => e.status === "ACTIVE").length,
            tone: "accent",
          },
          {
            label: "Pending approvals",
            value: pendingApprovals.length,
            tone: pendingApprovals.length > 0 ? "accent" : undefined,
          },
        ]}
      />

      {/* Pending approval banner */}
      {pendingApprovals.length > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>{pendingApprovals.length} payment(s)</strong> are awaiting admin approval.
            Access will be activated shortly after review.
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {/* Platform subscription */}
        <Panel>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Platform Subscription</h2>
          {platformSub ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">{platformSub.productName}</span>
                <StatusPill tone={STATUS_TONE[platformSub.status] ?? "muted"}>
                  {platformSub.status.replace(/_/g, " ")}
                </StatusPill>
              </div>
              {platformSub.currentPeriodEnd && (
                <p className="text-xs text-muted">
                  Period ends: {new Date(platformSub.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              {platformSub.status === "EXPIRED" && subscriptionProduct && (
                <PrimaryButton
                  type="button"
                  onClick={() => setCheckoutProduct(subscriptionProduct)}
                >
                  Renew — ${subscriptionProduct.amount}/mo
                </PrimaryButton>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">No active platform subscription.</p>
              {subscriptionProduct && (
                <PrimaryButton
                  type="button"
                  onClick={() => setCheckoutProduct(subscriptionProduct)}
                >
                  Subscribe — ${subscriptionProduct.amount}/month
                </PrimaryButton>
              )}
            </div>
          )}
        </Panel>

        {/* Copy trading entitlements */}
        <Panel>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Copy Trading Access</h2>
          {copyEntitlements.length === 0 ? (
            <EmptyState
              title="No copy entitlements"
              description="Purchase a copy-trading entitlement to follow strategies on an account."
            />
          ) : (
            <div className="space-y-2">
              {copyEntitlements.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-background px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {e.tier === "PREMIUM" ? "Ultra Fast" : "Normal"} tier
                    </p>
                    {e.currentPeriodEnd && (
                      <p className="text-xs text-muted">
                        Expires {new Date(e.currentPeriodEnd).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <StatusPill tone={STATUS_TONE[e.status] ?? "muted"}>
                    {e.status.replace(/_/g, " ")}
                  </StatusPill>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {copyProducts.map((p) => (
              <GhostButton key={p.code} type="button" onClick={() => setCheckoutProduct(p)}>
                + {p.name} — ${p.amount}/mo
              </GhostButton>
            ))}
          </div>
        </Panel>
      </div>

      {/* Other products */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {botProduct && (
          <Panel>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Trading Bot / EA</h2>
            <p className="mb-4 text-sm text-muted">
              One-time purchase — lifetime access to the bot after admin approval.
            </p>
            <PrimaryButton type="button" onClick={() => setCheckoutProduct(botProduct)}>
              <CreditCard className="mr-2 inline-block h-4 w-4" />
              Purchase — {formatMoney({ amount: botProduct.amount, currency: botProduct.currency })}
            </PrimaryButton>
          </Panel>
        )}

        {mentorshipProduct && (
          <Panel>
            <h2 className="mb-3 text-lg font-semibold text-foreground">1-to-1 Mentorship</h2>
            <p className="mb-4 text-sm text-muted">
              Direct 1-to-1 coaching sessions. Admin will contact you to schedule after payment.
            </p>
            <PrimaryButton type="button" onClick={() => setCheckoutProduct(mentorshipProduct)}>
              <CreditCard className="mr-2 inline-block h-4 w-4" />
              Pay — {formatMoney({ amount: mentorshipProduct.amount, currency: mentorshipProduct.currency })}
            </PrimaryButton>
          </Panel>
        )}
      </div>

      {/* Payment history */}
      <Panel className="mt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Payment history</h2>
          {paymentHistory.length > 0 && (
            <FilterChipRow
              chips={(["ALL", "PAID", "PENDING", "FAILED"] as const).map((s) => ({
                label: s === "ALL" ? `All (${paymentHistory.length})` : s,
                active: historyFilter === s,
                onClick: () => setHistoryFilter(s),
              }))}
            />
          )}
        </div>
        {paymentHistory.length === 0 ? (
          <p className="text-sm text-muted">No payments yet.</p>
        ) : (
          <DataTable
            headers={["Product", "Amount", "Status", "Date"]}
            rows={paidHistory.map((h) => [
              <span key="n" className="text-sm font-medium text-foreground">
                {h.productName}
              </span>,
              <span key="a">
                {formatMoney({ amount: h.amount, currency: h.currency })}
              </span>,
              <StatusPill key="s" tone={STATUS_TONE[h.status] ?? "muted"}>
                {h.status}
              </StatusPill>,
              <span key="d" className="text-xs text-muted">
                {new Date(h.createdAt).toLocaleDateString()}
              </span>,
            ])}
          />
        )}
      </Panel>

      {/* Checkout confirmation dialog */}
      <Dialog.Root open={Boolean(checkoutProduct)} onOpenChange={(o) => !o && setCheckoutProduct(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
            <Dialog.Title className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <CreditCard className="h-5 w-5 text-accent" />
              {checkoutProduct?.name}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              You will be redirected to the Airwallex secure checkout page to complete payment.
              Access is activated after payment is confirmed and admin-approved.
            </Dialog.Description>

            <div className="mt-4 rounded-xl border border-line bg-background px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Amount</span>
                <span className="font-semibold text-foreground">
                  {checkoutProduct
                    ? formatMoney({ amount: checkoutProduct.amount, currency: checkoutProduct.currency })
                    : ""}
                  {checkoutProduct?.billingInterval === "MONTHLY" ? " / month" : ""}
                </span>
              </div>
            </div>

            {checkoutProduct?.type === "COPY_ACCOUNT" && (
              <div className="mt-3">
                <SelectField
                  label="Account to entitle"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                >
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.accountId} value={a.accountId}>
                      {a.accountName}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-muted">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              <span>
                Demo sandbox — use Airwallex test card{" "}
                <strong className="font-mono text-foreground">4035 5010 0000 0008</strong>.
                No real money is charged.
              </span>
            </div>

            <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
              <Dialog.Close asChild>
                <GhostButton type="button">Cancel</GhostButton>
              </Dialog.Close>
              <PrimaryButton
                type="button"
                disabled={checkout.isPending || (checkoutProduct?.type === "COPY_ACCOUNT" && !selectedAccountId)}
                onClick={() => checkoutProduct && checkout.mutate(checkoutProduct)}
              >
                {checkout.isPending ? (
                  "Redirecting…"
                ) : (
                  <>
                    <ExternalLink className="mr-2 inline-block h-4 w-4" />
                    Proceed to checkout
                  </>
                )}
              </PrimaryButton>
            </div>
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
