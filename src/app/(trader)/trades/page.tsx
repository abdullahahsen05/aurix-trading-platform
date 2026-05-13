"use client";

import { useMemo, useState } from "react";
import { DirectorySearchOverlay } from "@/components/app/DirectorySearchOverlay";
import { GhostButton, InlineStatusStrip, Panel, PageActionGroup, PrimaryButton, StatusPill, WorkspacePage } from "@/components/app/WorkspaceUI";
import { trades } from "@/lib/data/mockData";
import { formatMoney } from "@/lib/utils/format";

type TradeRecord = (typeof trades)[number];

export default function TradesPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(trades[0]?.id ?? "");

  const tradeList = useMemo(() => trades, []);
  const selectedTrade = tradeList.find((trade) => trade.id === selectedId) ?? tradeList[0];

  const openTrades = tradeList.filter((trade) => trade.status === "OPEN");
  const closedTrades = tradeList.filter((trade) => trade.status === "CLOSED");
  const netProfit = tradeList.reduce((total, trade) => total + trade.profit.amount, 0);

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
          <PrimaryButton type="button">Sync trades</PrimaryButton>
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
            helper: "Mock ledger total",
            tone: netProfit >= 0 ? "lime" : "danger",
          },
          { label: "Symbols", value: "4", helper: "EURUSD, XAUUSD, GBPJPY, NAS100" },
        ]}
      />

      <div className="mt-5">
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
            <PrimaryButton type="button">Export</PrimaryButton>
          </div>
        </Panel>
      </div>

      <DirectorySearchOverlay<TradeRecord>
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search trades"
        description="Search, status filters, and paging stay in the overlay to keep the ledger minimal."
        items={tradeList}
        selectedId={selectedTrade.id}
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
