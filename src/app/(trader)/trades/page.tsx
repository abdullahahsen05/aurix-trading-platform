"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DirectorySearchOverlay } from "@/components/app/DirectorySearchOverlay";
import { EmptyState, GhostButton, InlineStatusStrip, Panel, PageActionGroup, PrimaryButton, StatusPill, WorkspacePage } from "@/components/app/WorkspaceUI";
import { formatMoney } from "@/lib/utils/format";
import type { TradeDto } from "@/lib/domain/types";

export default function TradesPage() {
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: tradeList = [], isLoading, isError } = useQuery<TradeDto[]>({
    queryKey: ["trades"],
    queryFn: async () => {
      const res = await fetch("/api/trades");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load trades");
      return json.data;
    },
  });

  const handleSyncTrades = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/trader/sync-trades", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Sync failed");

      type SyncResultItem = { tradesUpserted?: number; openPositions?: number; error?: string };
      const results: SyncResultItem[] = json.data?.results ?? [];
      const totalTrades = results.reduce((sum, r) => sum + (r.tradesUpserted ?? 0), 0);
      const totalOpen = results.reduce((sum, r) => sum + (r.openPositions ?? 0), 0);
      const anyError = results.find(r => r.error);

      if (anyError) {
        setSyncResult({ type: "error", text: anyError.error ?? "Unknown sync error" });
      } else {
        setSyncResult({
          type: "success",
          text: `Synced ${totalOpen} open position${totalOpen !== 1 ? "s" : ""} and ${totalTrades} trade record${totalTrades !== 1 ? "s" : ""}.`,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["trades"] });
    } catch (err) {
      setSyncResult({ type: "error", text: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setSyncing(false);
    }
  }, [queryClient]);

  // Set initial selectedId once trades load
  const effectiveSelectedId = selectedId || tradeList[0]?.id || "";
  const selectedTrade = tradeList.find((trade) => trade.id === effectiveSelectedId) ?? tradeList[0];

  const openTrades = useMemo(() => tradeList.filter((trade) => trade.status === "OPEN"), [tradeList]);
  const closedTrades = useMemo(() => tradeList.filter((trade) => trade.status === "CLOSED"), [tradeList]);
  const netProfit = useMemo(() => tradeList.reduce((total, trade) => total + trade.profit.amount, 0), [tradeList]);

  const uniqueSymbols = useMemo(
    () => [...new Set(tradeList.map((t) => t.symbol))],
    [tradeList],
  );

  return (
    <WorkspacePage
      eyebrow="Trade ledger"
      title="Trade history"
      description="Minimal trade ledger shell with the searchable history tucked into an overlay."
      action={
        <PageActionGroup>
          <GhostButton type="button" onClick={() => setSearchOpen(true)}>
            Search
          </GhostButton>
          <PrimaryButton type="button" disabled={syncing} onClick={handleSyncTrades}>
            {syncing ? "Syncing…" : "Sync Trades"}
          </PrimaryButton>
        </PageActionGroup>
      }
    >
      <InlineStatusStrip
        items={[
          { label: "Open trades", value: openTrades.length, helper: "Across connected accounts", tone: "accent" },
          { label: "Closed trades", value: closedTrades.length, helper: "Current review period" },
          {
            label: "Net PnL",
            value: formatMoney({ amount: netProfit, currency: "USD" }),
            helper: "Ledger total",
            tone: netProfit >= 0 ? "lime" : "danger",
          },
          {
            label: "Symbols",
            value: uniqueSymbols.length,
            helper: uniqueSymbols.slice(0, 4).join(", ") || "None",
          },
        ]}
      />

      {syncResult && (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-medium ${
            syncResult.type === "success"
              ? "border-accent/20 bg-accent/10 text-accent"
              : "border-danger/20 bg-danger/10 text-danger"
          }`}
        >
          {syncResult.text}
        </div>
      )}

      <div className="mt-5">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl border border-line bg-panel animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            Failed to load trades. Please refresh the page.
          </div>
        ) : !selectedTrade ? (
          <EmptyState
            title="No trades yet"
            description="Trades will appear here after your account syncs with your broker."
          />
        ) : (
          <Panel className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Selected trade</p>
                <h2 className="mt-2 text-lg font-semibold text-foreground">{selectedTrade.symbol}</h2>
                <p className="mt-1 text-sm text-muted">
                  {selectedTrade.side} - {selectedTrade.accountId}
                </p>
              </div>
              <StatusPill tone={selectedTrade.status === "OPEN" ? "accent" : "muted"}>{selectedTrade.status}</StatusPill>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Volume</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{selectedTrade.volume}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Open price</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{selectedTrade.openPrice}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Profit</p>
                <p
                  className={`mt-1 text-sm font-semibold ${
                    selectedTrade.profit.amount >= 0 ? "text-accent-2" : "text-danger"
                  }`}
                >
                  {formatMoney(selectedTrade.profit)}
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Opened</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{new Date(selectedTrade.openedAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <GhostButton type="button" onClick={() => setSearchOpen(true)}>
                Search ledger
              </GhostButton>
              <PrimaryButton
                type="button"
                onClick={async () => {
                  const res = await fetch("/api/reports/trades");
                  if (!res.ok) return;
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `aurix-trades-${new Date().toISOString().slice(0, 10)}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }}
              >
                Export CSV
              </PrimaryButton>
            </div>
          </Panel>
        )}
      </div>

      <DirectorySearchOverlay<TradeDto>
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search trades"
        description="Search, status filters, and paging stay in the overlay to keep the ledger minimal."
        items={tradeList}
        selectedId={effectiveSelectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setSearchOpen(false);
        }}
        searchLabel="Search ledger"
        searchPlaceholder="Search symbol or account"
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "ALL", label: "All trades" },
              { value: "OPEN", label: "Open" },
              { value: "CLOSED", label: "Closed" },
            ],
          },
        ]}
        emptyTitle="No trades match"
        emptyDescription="Change the search term or status filter."
        getId={(trade) => trade.id}
        matches={(trade, state) => {
          const search = state.query.trim().toLowerCase();
          const matchesQuery =
            search.length === 0 ||
            trade.symbol.toLowerCase().includes(search) ||
            trade.accountId.toLowerCase().includes(search);
          const matchesStatus = state.filters.status === "ALL" || trade.status === state.filters.status;
          return matchesQuery && matchesStatus;
        }}
        renderRow={(trade) => (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{trade.symbol}</p>
                <p className="mt-1 truncate text-xs text-muted">{trade.accountId}</p>
              </div>
              <StatusPill tone={trade.status === "OPEN" ? "accent" : "muted"}>{trade.status}</StatusPill>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-muted">
                {trade.side}
              </span>
              <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-muted">
                {new Date(trade.openedAt).toLocaleDateString()}
              </span>
            </div>
          </>
        )}
        renderPreview={(trade) => (
          <Panel className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Trade preview</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{trade.symbol}</h3>
                <p className="mt-1 text-sm text-muted">
                  {trade.side} - {trade.accountId}
                </p>
              </div>
              <StatusPill tone={trade.status === "OPEN" ? "accent" : "muted"}>{trade.status}</StatusPill>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Volume</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{trade.volume}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Open price</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{trade.openPrice}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Profit</p>
                <p
                  className={`mt-1 text-sm font-semibold ${
                    trade.profit.amount >= 0 ? "text-accent-2" : "text-danger"
                  }`}
                >
                  {formatMoney(trade.profit)}
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Opened</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{new Date(trade.openedAt).toLocaleString()}</p>
              </div>
            </div>
          </Panel>
        )}
      />
    </WorkspacePage>
  );
}
