"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  EmptyState,
  FilterChipRow,
  Panel,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import type { BotProductDto } from "@/lib/domain/types";

const RISK_TONES: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  LOW: "lime",
  MEDIUM: "accent",
  HIGH: "danger",
};

export default function MarketplacePage() {
  const [platformFilter, setPlatformFilter] = useState<"ALL" | "MT5" | "MT4">("ALL");
  const [riskFilter, setRiskFilter] = useState<"ALL" | "LOW" | "MEDIUM" | "HIGH">("ALL");

  const { data: products = [], isLoading, isError, error } = useQuery<BotProductDto[]>({
    queryKey: ["marketplace-products"],
    queryFn: async () => {
      const res = await fetch("/api/marketplace/products");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load marketplace");
      return json.data;
    },
  });

  const filtered = products
    .filter((p) => platformFilter === "ALL" || p.platform === platformFilter || p.platform === "BOTH")
    .filter((p) => riskFilter === "ALL" || p.riskLevel === riskFilter);

  return (
    <WorkspacePage
      eyebrow="Trading Tools"
      title="Bot Marketplace"
      description="Explore and request access to trading bots"
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
          {filtered.map((product) => (
            <Link
              key={product.id}
              href={`/marketplace/${product.slug}`}
              className="group flex flex-col gap-3 rounded-3xl border border-line bg-panel p-5 transition-colors hover:border-accent/40 hover:bg-panel/80"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground group-hover:text-accent">
                  {product.name}
                </h3>
                <StatusPill tone="muted">{product.platform}</StatusPill>
              </div>
              {product.shortDescription ? (
                <p className="text-sm text-muted line-clamp-2">{product.shortDescription}</p>
              ) : null}
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {product.difficulty ? (
                  <StatusPill tone="muted">{product.difficulty}</StatusPill>
                ) : null}
                {product.riskLevel ? (
                  <StatusPill tone={RISK_TONES[product.riskLevel] ?? "muted"}>
                    {product.riskLevel} Risk
                  </StatusPill>
                ) : null}
                <span className="ml-auto text-sm font-semibold text-accent">
                  {product.pricingLabel ?? (product.priceAmount != null ? `$${product.priceAmount}` : "Free")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </WorkspacePage>
  );
}
