"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  EmptyState,
  FilterChipRow,
  GhostButton,
  Panel,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { BillingCheckoutModal } from "@/components/app/BillingCheckoutModal";
import type { BotProductDto } from "@/lib/domain/types";
import type { UserBillingSummaryDto } from "@/lib/services/billingService";

const RISK_TONES: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  LOW: "lime",
  MEDIUM: "accent",
  HIGH: "danger",
};

const BOT_EA_PRODUCT = {
  code: "BOT_EA",
  name: "Trading Bot / EA",
  amount: 500,
  currency: "USD",
  billingInterval: "ONE_TIME",
  description: "One-time purchase — lifetime access after admin approval.",
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data;
}

export default function MarketplacePage() {
  const [platformFilter, setPlatformFilter] = useState<"ALL" | "MT5" | "MT4">("ALL");
  const [riskFilter, setRiskFilter] = useState<"ALL" | "LOW" | "MEDIUM" | "HIGH">("ALL");
  const [buyBotId, setBuyBotId] = useState<string | null>(null);

  const { data: products = [], isLoading, isError, error } = useQuery<BotProductDto[]>({
    queryKey: ["marketplace-products"],
    queryFn: () => getJson("/api/marketplace/products"),
  });

  const { data: summary } = useQuery<UserBillingSummaryDto>({
    queryKey: ["billing-me"],
    queryFn: () => getJson("/api/billing/me"),
    staleTime: 60_000,
  });

  const filtered = products
    .filter((p) => platformFilter === "ALL" || p.platform === platformFilter || p.platform === "BOTH")
    .filter((p) => riskFilter === "ALL" || p.riskLevel === riskFilter);

  function getBotAccessState(botProductId: string): "NONE" | "PENDING_APPROVAL" | "ACTIVE" | "PENDING_PAYMENT" {
    if (summary?.botAccess.some((b) => b.botProductId === botProductId && b.status === "ACTIVE")) return "ACTIVE";
    if (summary?.botAccess.some((b) => b.botProductId === botProductId && b.status === "REQUESTED")) return "PENDING_APPROVAL";
    const order = summary?.paymentHistory.find(
      (h) => h.productCode === "BOT_EA" && h.botProductId === botProductId && ["PAID", "PENDING"].includes(h.status)
    );
    if (order?.status === "PAID") return "PENDING_APPROVAL";
    if (order?.status === "PENDING") return "PENDING_PAYMENT";
    return "NONE";
  }

  const buyingBot = products.find((p) => p.id === buyBotId);

  return (
    <WorkspacePage
      eyebrow="Trading Tools"
      title="Bot Marketplace"
      description="Explore and purchase trading bots and expert advisors"
    >
      <div className="space-y-3">
        <FilterChipRow
          chips={[
            { label: "All platforms", active: platformFilter === "ALL", onClick: () => setPlatformFilter("ALL") },
            { label: "MT5", active: platformFilter === "MT5", onClick: () => setPlatformFilter("MT5") },
            { label: "MT4", active: platformFilter === "MT4", onClick: () => setPlatformFilter("MT4") },
          ]}
        />
        <FilterChipRow
          chips={[
            { label: "All risk levels", active: riskFilter === "ALL", onClick: () => setRiskFilter("ALL") },
            { label: "Low risk", active: riskFilter === "LOW", onClick: () => setRiskFilter("LOW") },
            { label: "Medium risk", active: riskFilter === "MEDIUM", onClick: () => setRiskFilter("MEDIUM") },
            { label: "High risk", active: riskFilter === "HIGH", onClick: () => setRiskFilter("HIGH") },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-3xl bg-panel" />
          ))}
        </div>
      ) : isError ? (
        <Panel>
          <p className="text-sm text-danger">
            {error instanceof Error ? error.message : "Failed to load marketplace. Please refresh."}
          </p>
        </Panel>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No bots available"
          description="Check back soon — new bots are added regularly."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => {
            const accessState = getBotAccessState(product.id);
            return (
              <div
                key={product.id}
                className="flex flex-col gap-3 rounded-3xl border border-line bg-panel p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/marketplace/${product.slug}`}
                    className="text-base font-semibold text-foreground hover:text-accent"
                  >
                    {product.name}
                  </Link>
                  <StatusPill tone="muted">{product.platform}</StatusPill>
                </div>
                {product.shortDescription ? (
                  <p className="text-sm text-muted line-clamp-2">{product.shortDescription}</p>
                ) : null}
                <div className="mt-auto space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {product.riskLevel ? (
                      <StatusPill tone={RISK_TONES[product.riskLevel] ?? "muted"}>
                        {product.riskLevel} Risk
                      </StatusPill>
                    ) : null}
                    <span className="ml-auto text-sm font-semibold text-accent">
                      {product.pricingLabel ?? (product.priceAmount != null ? `$${product.priceAmount}` : "$500")} — one-time
                    </span>
                  </div>
                  {/* Purchase state */}
                  {accessState === "ACTIVE" ? (
                    <StatusPill tone="lime">Access granted</StatusPill>
                  ) : accessState === "PENDING_APPROVAL" ? (
                    <StatusPill tone="accent">Pending admin approval</StatusPill>
                  ) : accessState === "PENDING_PAYMENT" ? (
                    <StatusPill tone="muted">Payment pending</StatusPill>
                  ) : (
                    <GhostButton
                      type="button"
                      onClick={() => setBuyBotId(product.id)}
                    >
                      Buy Bot
                    </GhostButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {buyingBot && (
        <BillingCheckoutModal
          open={Boolean(buyBotId)}
          onClose={() => setBuyBotId(null)}
          product={{
            ...BOT_EA_PRODUCT,
            name: `${buyingBot.name} — Bot / EA`,
          }}
          botProductId={buyBotId ?? undefined}
        />
      )}
    </WorkspacePage>
  );
}
