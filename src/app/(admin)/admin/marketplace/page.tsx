"use client";

import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DataTable,
  EmptyState,
  FilterChipRow,
  GhostButton,
  Panel,
  PageActionGroup,
  PrimaryButton,
  StatTile,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import type { BotProductDto, BotAccessRecordDto, BotLicenseDto } from "@/lib/domain/types";

type AdminAccessRow = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: BotAccessRecordDto["status"];
  source: string;
  grantedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type Analytics = {
  totalProducts: number;
  publishedProducts: number;
  totalRequests: number;
  activeAccess: number;
  totalLicenses: number;
  activeLicenses: number;
  verificationLogs24h: number;
};

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data as T;
}

const PRODUCT_STATUS_TONE: Record<string, "lime" | "accent" | "muted"> = {
  PUBLISHED: "lime",
  DRAFT: "accent",
  ARCHIVED: "muted",
};

const ACCESS_STATUS_TONE: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  ACTIVE: "lime",
  REQUESTED: "accent",
  SUSPENDED: "danger",
  REVOKED: "danger",
  EXPIRED: "muted",
};

const LICENSE_TONE: Record<string, "lime" | "danger" | "muted"> = {
  ACTIVE: "lime",
  REVOKED: "danger",
  SUSPENDED: "danger",
  EXPIRED: "muted",
};

const BLANK_PRODUCT = {
  slug: "",
  name: "",
  shortDescription: "",
  platform: "MT5" as BotProductDto["platform"],
  status: "DRAFT" as BotProductDto["status"],
  difficulty: "" as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "",
  riskLevel: "" as "LOW" | "MEDIUM" | "HIGH" | "",
  pricingLabel: "",
  version: "",
};

export default function AdminMarketplacePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"products" | "access" | "licenses">("products");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(BLANK_PRODUCT);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [accessFilter, setAccessFilter] = useState<"ALL" | "REQUESTED" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED">("ALL");

  const { data: analytics } = useQuery<Analytics>({
    queryKey: ["admin-marketplace-analytics"],
    queryFn: () => apiFetch("/api/admin/marketplace/analytics"),
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<BotProductDto[]>({
    queryKey: ["admin-marketplace-products"],
    queryFn: () => apiFetch("/api/admin/marketplace/products"),
    enabled: tab === "products",
  });

  const { data: accessRows = [], isLoading: accessLoading } = useQuery<AdminAccessRow[]>({
    queryKey: ["admin-marketplace-access"],
    queryFn: () => apiFetch("/api/admin/marketplace/access"),
    enabled: tab === "access",
  });

  const { data: licenses = [], isLoading: licensesLoading } = useQuery<BotLicenseDto[]>({
    queryKey: ["admin-marketplace-licenses"],
    queryFn: () => apiFetch("/api/admin/marketplace/licenses"),
    enabled: tab === "licenses",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/admin/marketplace/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: form.slug.trim(),
          name: form.name.trim(),
          shortDescription: form.shortDescription.trim() || undefined,
          platform: form.platform,
          status: form.status,
          difficulty: form.difficulty || undefined,
          riskLevel: form.riskLevel || undefined,
          pricingLabel: form.pricingLabel.trim() || undefined,
          version: form.version.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-analytics"] });
      setCreateOpen(false);
      setForm(BLANK_PRODUCT);
      setNotice({ type: "success", text: "Product created." });
    },
    onError: (err: Error) => setNotice({ type: "error", text: err.message }),
  });

  const publishMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BotProductDto["status"] }) =>
      apiFetch(`/api/admin/marketplace/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-analytics"] });
    },
    onError: (err: Error) => setNotice({ type: "error", text: err.message }),
  });

  const accessActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiFetch(`/api/admin/marketplace/access/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-access"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-analytics"] });
    },
    onError: (err: Error) => setNotice({ type: "error", text: err.message }),
  });

  const revokeLicenseMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/admin/marketplace/licenses/${id}/revoke`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-licenses"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-analytics"] });
      setNotice({ type: "success", text: "License revoked." });
    },
    onError: (err: Error) => setNotice({ type: "error", text: err.message }),
  });

  const reissueLicenseMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<BotLicenseDto>(`/api/admin/marketplace/licenses/${id}/reissue`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-licenses"] });
      setNotice({
        type: "success",
        text: `License reissued (ends ···${data.licenseKeyLast4}). Trader generates the new key from My Bots.`,
      });
    },
    onError: (err: Error) => setNotice({ type: "error", text: err.message }),
  });

  const filteredAccess =
    accessFilter === "ALL" ? accessRows : accessRows.filter((r) => r.status === accessFilter);

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    createMutation.mutate();
  }

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="Bot Marketplace"
      description="Manage products, access requests, and license keys"
    >
      {/* Analytics */}
      {analytics ? (
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Products" value={analytics.totalProducts} />
          <StatTile label="Published" value={analytics.publishedProducts} />
          <StatTile label="Requests" value={analytics.totalRequests} />
          <StatTile label="Active Access" value={analytics.activeAccess} />
          <StatTile label="Licenses" value={analytics.totalLicenses} />
          <StatTile label="Verifications (24h)" value={analytics.verificationLogs24h} />
        </div>
      ) : null}

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

      {/* Tabs */}
      <FilterChipRow
        chips={[
          { label: "Products", active: tab === "products", onClick: () => setTab("products") },
          { label: "Access Requests", active: tab === "access", onClick: () => setTab("access") },
          { label: "Licenses", active: tab === "licenses", onClick: () => setTab("licenses") },
        ]}
      />

      {/* Products tab */}
      {tab === "products" ? (
        <>
          <PageActionGroup>
            <PrimaryButton type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 inline-block h-3.5 w-3.5" />
              New Product
            </PrimaryButton>
          </PageActionGroup>
          {productsLoading ? (
            <div className="h-32 animate-pulse rounded-3xl bg-panel" />
          ) : products.length === 0 ? (
            <EmptyState title="No products yet" description="Create your first bot product." />
          ) : (
            <DataTable
              headers={["Name", "Platform", "Status", "Version", "Actions"]}
              rows={products.map((p) => [
                p.name,
                p.platform,
                <StatusPill key="s" tone={PRODUCT_STATUS_TONE[p.status] ?? "muted"}>{p.status}</StatusPill>,
                p.version ?? "—",
                <div key="a" className="flex gap-2">
                  {p.status !== "PUBLISHED" ? (
                    <GhostButton
                      type="button"
                      onClick={() => publishMutation.mutate({ id: p.id, status: "PUBLISHED" })}
                      disabled={publishMutation.isPending}
                    >
                      Publish
                    </GhostButton>
                  ) : (
                    <GhostButton
                      type="button"
                      onClick={() => publishMutation.mutate({ id: p.id, status: "ARCHIVED" })}
                      disabled={publishMutation.isPending}
                    >
                      Archive
                    </GhostButton>
                  )}
                </div>,
              ])}
            />
          )}
        </>
      ) : null}

      {/* Access tab */}
      {tab === "access" ? (
        <>
          <FilterChipRow
            chips={[
              { label: "All", active: accessFilter === "ALL", onClick: () => setAccessFilter("ALL") },
              { label: "Requested", active: accessFilter === "REQUESTED", onClick: () => setAccessFilter("REQUESTED") },
              { label: "Active", active: accessFilter === "ACTIVE", onClick: () => setAccessFilter("ACTIVE") },
              { label: "Suspended", active: accessFilter === "SUSPENDED", onClick: () => setAccessFilter("SUSPENDED") },
              { label: "Revoked", active: accessFilter === "REVOKED", onClick: () => setAccessFilter("REVOKED") },
            ]}
          />
          {accessLoading ? (
            <div className="h-32 animate-pulse rounded-3xl bg-panel" />
          ) : filteredAccess.length === 0 ? (
            <EmptyState title="No access records" description="Access requests will appear here." />
          ) : (
            <DataTable
              headers={["User", "Product", "Status", "Source", "Requested", "Actions"]}
              rows={filteredAccess.map((r) => [
                <div key="u">
                  <p className="font-medium text-foreground">{r.userName || r.userEmail}</p>
                  <p className="text-xs text-muted">{r.userEmail}</p>
                </div>,
                r.productName,
                <StatusPill key="s" tone={ACCESS_STATUS_TONE[r.status] ?? "muted"}>{r.status}</StatusPill>,
                r.source,
                new Date(r.createdAt).toLocaleDateString(),
                <div key="a" className="flex flex-wrap gap-1.5">
                  {r.status === "REQUESTED" ? (
                    <GhostButton
                      type="button"
                      onClick={() => accessActionMutation.mutate({ id: r.id, action: "grant" })}
                      disabled={accessActionMutation.isPending}
                    >
                      Grant
                    </GhostButton>
                  ) : null}
                  {r.status === "ACTIVE" ? (
                    <GhostButton
                      type="button"
                      onClick={() => accessActionMutation.mutate({ id: r.id, action: "suspend" })}
                      disabled={accessActionMutation.isPending}
                    >
                      Suspend
                    </GhostButton>
                  ) : null}
                  {r.status !== "REVOKED" && r.status !== "EXPIRED" ? (
                    <GhostButton
                      type="button"
                      onClick={() => accessActionMutation.mutate({ id: r.id, action: "revoke" })}
                      disabled={accessActionMutation.isPending}
                    >
                      Revoke
                    </GhostButton>
                  ) : null}
                  {(r.status === "SUSPENDED" || r.status === "REVOKED") ? (
                    <GhostButton
                      type="button"
                      onClick={() => accessActionMutation.mutate({ id: r.id, action: "reactivate" })}
                      disabled={accessActionMutation.isPending}
                    >
                      Reactivate
                    </GhostButton>
                  ) : null}
                </div>,
              ])}
            />
          )}
        </>
      ) : null}

      {/* Licenses tab */}
      {tab === "licenses" ? (
        <>
          {licensesLoading ? (
            <div className="h-32 animate-pulse rounded-3xl bg-panel" />
          ) : licenses.length === 0 ? (
            <EmptyState
              title="No licenses issued"
              description="Licenses appear here after traders generate them from My Bots."
            />
          ) : (
            <DataTable
              headers={["Product", "MT5 Account", "Platform", "···Last4", "Status", "Issued", "Actions"]}
              rows={licenses.map((l) => [
                l.productName,
                l.mt5AccountNumber,
                l.platform,
                <span key="l4" className="font-mono text-muted">···{l.licenseKeyLast4}</span>,
                <StatusPill key="s" tone={LICENSE_TONE[l.status] ?? "muted"}>{l.status}</StatusPill>,
                new Date(l.issuedAt).toLocaleDateString(),
                <div key="a" className="flex gap-1.5">
                  {l.status === "ACTIVE" ? (
                    <GhostButton
                      type="button"
                      onClick={() => revokeLicenseMutation.mutate(l.id)}
                      disabled={revokeLicenseMutation.isPending}
                    >
                      Revoke
                    </GhostButton>
                  ) : null}
                  <GhostButton
                    type="button"
                    onClick={() => reissueLicenseMutation.mutate(l.id)}
                    disabled={reissueLicenseMutation.isPending}
                  >
                    Reissue
                  </GhostButton>
                </div>,
              ])}
            />
          )}
        </>
      ) : null}

      {/* Create product dialog */}
      <Dialog.Root open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-background p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-base font-semibold text-foreground">
                New Bot Product
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded-lg p-1 text-muted hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleCreate} className="mt-4 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Name <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    maxLength={200}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Slug <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    maxLength={100}
                    pattern="[a-z0-9-]+"
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    placeholder="e.g. trend-master-pro"
                    className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Short description
                </label>
                <input
                  maxLength={500}
                  value={form.shortDescription}
                  onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))}
                  className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Platform
                  </label>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as BotProductDto["platform"] }))}
                    className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    <option value="MT5">MT5</option>
                    <option value="MT4">MT4</option>
                    <option value="BOTH">Both</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as BotProductDto["status"] }))}
                    className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Difficulty
                  </label>
                  <select
                    value={form.difficulty}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, difficulty: e.target.value as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "" }))
                    }
                    className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    <option value="">None</option>
                    <option value="BEGINNER">Beginner</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="ADVANCED">Advanced</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Risk level
                  </label>
                  <select
                    value={form.riskLevel}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, riskLevel: e.target.value as "LOW" | "MEDIUM" | "HIGH" | "" }))
                    }
                    className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    <option value="">None</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Version
                  </label>
                  <input
                    maxLength={30}
                    value={form.version}
                    onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                    placeholder="e.g. 1.0.0"
                    className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Pricing label
                </label>
                <input
                  maxLength={100}
                  value={form.pricingLabel}
                  onChange={(e) => setForm((f) => ({ ...f, pricingLabel: e.target.value }))}
                  placeholder="e.g. Free, $99/mo, Contact us"
                  className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-line pt-4">
                <Dialog.Close asChild>
                  <GhostButton type="button">Cancel</GhostButton>
                </Dialog.Close>
                <PrimaryButton type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating…" : "Create Product"}
                </PrimaryButton>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </WorkspacePage>
  );
}
