"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  EmptyState,
  Panel,
  PrimaryButton,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import type { BotProductDto, BotAccessRecordDto } from "@/lib/domain/types";
import { CheckCircle2 } from "lucide-react";

interface PageData {
  product: BotProductDto;
  access: BotAccessRecordDto | null;
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data as T;
}

const ACCESS_STATUS_TONE: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  ACTIVE: "lime",
  REQUESTED: "accent",
  SUSPENDED: "danger",
  REVOKED: "danger",
  EXPIRED: "muted",
};

export default function MarketplaceProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { data, isLoading, isError } = useQuery<PageData>({
    queryKey: ["marketplace-product", slug],
    queryFn: () => apiFetch(`/api/marketplace/products/${slug}`),
  });

  const requestMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/marketplace/products/${data!.product.id}/request-access`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-product", slug] });
      queryClient.invalidateQueries({ queryKey: ["my-bots"] });
      setNotice({ type: "success", text: "Access requested. An admin will review your request shortly." });
    },
    onError: (err: Error) => setNotice({ type: "error", text: err.message }),
  });

  if (isLoading) {
    return (
      <WorkspacePage eyebrow="Marketplace" title="Loading…" description="">
        <div className="h-48 animate-pulse rounded-3xl bg-panel" />
      </WorkspacePage>
    );
  }

  if (isError || !data) {
    return (
      <WorkspacePage eyebrow="Marketplace" title="Not found" description="">
        <EmptyState
          title="Product not found"
          description="This product may have been removed or is not yet published."
        />
      </WorkspacePage>
    );
  }

  const { product, access } = data;

  return (
    <WorkspacePage
      eyebrow="Marketplace"
      title={product.name}
      description={product.shortDescription ?? ""}
    >
      {/* Notice */}
      {notice ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            notice.type === "success"
              ? "border-accent/20 bg-accent/10 text-accent"
              : "border-danger/20 bg-danger/10 text-danger"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="muted">{product.platform}</StatusPill>
            {product.difficulty ? <StatusPill tone="muted">{product.difficulty}</StatusPill> : null}
            {product.riskLevel ? (
              <StatusPill tone={product.riskLevel === "LOW" ? "lime" : product.riskLevel === "HIGH" ? "danger" : "accent"}>
                {product.riskLevel} Risk
              </StatusPill>
            ) : null}
            {product.version ? <StatusPill tone="muted">v{product.version}</StatusPill> : null}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-foreground">
              {product.pricingLabel ?? (product.priceAmount != null ? `$${product.priceAmount}` : "Free")}
            </p>
            <p className="text-xs text-muted">{product.priceCurrency}</p>
          </div>
        </div>

        {product.description ? (
          <p className="mt-4 whitespace-pre-wrap text-sm text-muted">{product.description}</p>
        ) : null}

        {product.features && product.features.length > 0 ? (
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {product.features.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent-2" />
                {f}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          {!access ? (
            <PrimaryButton
              type="button"
              disabled={requestMutation.isPending}
              onClick={() => { setNotice(null); requestMutation.mutate(); }}
            >
              {requestMutation.isPending ? "Requesting…" : "Request Access"}
            </PrimaryButton>
          ) : (
            <div className="flex items-center gap-2">
              <StatusPill tone={ACCESS_STATUS_TONE[access.status] ?? "muted"}>
                {access.status}
              </StatusPill>
              <p className="text-sm text-muted">
                {access.status === "REQUESTED"
                  ? "Your request is pending admin review."
                  : access.status === "ACTIVE"
                  ? "You have active access to this bot."
                  : access.status === "REVOKED"
                  ? "Your access has been revoked."
                  : ""}
              </p>
            </div>
          )}
        </div>
      </Panel>
    </WorkspacePage>
  );
}
