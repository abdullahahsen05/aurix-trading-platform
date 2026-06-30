"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

// When DXFEED_WIDGET_CDN_URL is set, render the Candelabra widget terminal
// instead of the mock terminal. The CDN URL is a NEXT_PUBLIC_ var so it is
// available in the client bundle without exposing any credential.
const DXFEED_CDN = process.env.NEXT_PUBLIC_DXFEED_WIDGET_CDN_URL ?? "";

const DxfeedTerminal = dynamic(
  () => import("@/components/terminal/DxfeedTerminal"),
  { ssr: false }
);
import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type {
  ProviderStatus,
  SymbolInfo,
  QuoteData,
  CandleData,
  DomData,
  VolumeProfileData,
  HeatmapData,
  NewsItem,
  MacroEvent,
  TerminalPreferences,
  Timeframe,
} from "@/lib/terminal/types";

const CandleChart = dynamic(() => import("@/components/terminal/CandleChart"), { ssr: false });

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const IMPACT_COLOR: Record<string, string> = {
  HIGH: "text-red-400",
  MEDIUM: "text-yellow-400",
  LOW: "text-muted-foreground",
};

const SENTIMENT_COLOR: Record<string, string> = {
  bullish: "text-green-400",
  bearish: "text-red-400",
  neutral: "text-muted-foreground",
};

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data as T;
}

export default function TerminalPage() {
  const [symbol, setSymbol] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [rightPanel, setRightPanel] = useState<"dom" | "vprofile" | "heatmap">("dom");
  const [bottomPanel, setBottomPanel] = useState<"macro" | "news">("macro");
  const [prefsSynced, setPrefsSynced] = useState(false);

  // Load saved preferences on mount
  const { data: prefs } = useQuery<TerminalPreferences>({
    queryKey: ["terminal-prefs"],
    queryFn: () => apiFetch("/api/terminal/preferences"),
  });

  useEffect(() => {
    if (prefs && !prefsSynced) {
      setSymbol(prefs.symbol);
      setTimeframe(prefs.timeframe);
      setPrefsSynced(true);
    }
  }, [prefs, prefsSynced]);

  const savePrefsMutation = useMutation({
    mutationFn: (data: Partial<TerminalPreferences>) =>
      apiFetch("/api/terminal/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });

  const changeSymbol = useCallback(
    (sym: string) => {
      setSymbol(sym);
      savePrefsMutation.mutate({ symbol: sym });
    },
    [savePrefsMutation]
  );

  const changeTimeframe = useCallback(
    (tf: Timeframe) => {
      setTimeframe(tf);
      savePrefsMutation.mutate({ timeframe: tf });
    },
    [savePrefsMutation]
  );

  const { data: providerStatus } = useQuery<ProviderStatus>({
    queryKey: ["terminal-provider-status"],
    queryFn: () => apiFetch("/api/terminal/provider/status"),
    staleTime: 60_000,
  });

  const { data: symbols = [] } = useQuery<SymbolInfo[]>({
    queryKey: ["terminal-symbols"],
    queryFn: () => apiFetch("/api/terminal/symbols"),
    staleTime: 300_000,
  });

  const { data: quote } = useQuery<QuoteData>({
    queryKey: ["terminal-quote", symbol],
    queryFn: () => apiFetch(`/api/terminal/quote?symbol=${symbol}`),
    refetchInterval: 3000,
    enabled: Boolean(symbol),
  });

  const { data: candles } = useQuery<CandleData>({
    queryKey: ["terminal-candles", symbol, timeframe],
    queryFn: () => apiFetch(`/api/terminal/candles?symbol=${symbol}&timeframe=${timeframe}`),
    staleTime: 10_000,
    enabled: Boolean(symbol),
  });

  const { data: dom } = useQuery<DomData>({
    queryKey: ["terminal-dom", symbol],
    queryFn: () => apiFetch(`/api/terminal/dom?symbol=${symbol}`),
    refetchInterval: 2000,
    enabled: rightPanel === "dom" && Boolean(symbol),
  });

  const { data: vprofile } = useQuery<VolumeProfileData>({
    queryKey: ["terminal-vprofile", symbol],
    queryFn: () => apiFetch(`/api/terminal/volume-profile?symbol=${symbol}`),
    staleTime: 30_000,
    enabled: rightPanel === "vprofile" && Boolean(symbol),
  });

  const { data: heatmap } = useQuery<HeatmapData>({
    queryKey: ["terminal-heatmap", symbol],
    queryFn: () => apiFetch(`/api/terminal/heatmap?symbol=${symbol}`),
    staleTime: 30_000,
    enabled: rightPanel === "heatmap" && Boolean(symbol),
  });

  const { data: macro = [] } = useQuery<MacroEvent[]>({
    queryKey: ["terminal-macro"],
    queryFn: () => apiFetch("/api/terminal/macro"),
    staleTime: 300_000,
  });

  const { data: news = [] } = useQuery<NewsItem[]>({
    queryKey: ["terminal-news", symbol],
    queryFn: () => apiFetch(`/api/terminal/news?symbol=${symbol}`),
    staleTime: 120_000,
  });

  const symbolInfo = symbols.find((s) => s.symbol === symbol);
  const decimals = symbolInfo?.displayDecimals ?? 5;

  const fmtPrice = (p: number) => p.toFixed(decimals);
  const fmtChange = (c: number) =>
    `${c >= 0 ? "+" : ""}${c.toFixed(decimals)} (${quote ? (quote.changePct >= 0 ? "+" : "") + quote.changePct.toFixed(2) + "%" : ""})`;

  const byCategory = (cat: string) => symbols.filter((s) => s.category === cat);

  // Render dxFeed Candelabra widgets when CDN is provisioned
  if (DXFEED_CDN) {
    return (
      <div className="h-screen overflow-hidden">
        <DxfeedTerminal
          initialSymbol={symbol}
          onSymbolChange={changeSymbol}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ─── Top bar ──────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-4 border-b border-border bg-card px-4 py-2">
        {/* Provider badge */}
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            providerStatus?.mode === "live"
              ? "bg-green-900/40 text-green-400"
              : "bg-zinc-800 text-muted-foreground"
          }`}
        >
          {providerStatus?.label ?? "Demo Market Data"}
        </span>

        {/* Symbol + price */}
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-bold">{symbol}</span>
          {quote && (
            <>
              <span className="text-lg font-mono font-semibold tabular-nums">
                {fmtPrice(quote.mid)}
              </span>
              <span
                className={`text-xs font-mono ${
                  quote.changePct >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {fmtChange(quote.change)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                H: {fmtPrice(quote.high24h)} L: {fmtPrice(quote.low24h)}
              </span>
            </>
          )}
        </div>

        {/* Bid/Ask */}
        {quote && (
          <div className="ml-4 flex gap-3 text-xs font-mono tabular-nums">
            <span className="text-red-400">ASK {fmtPrice(quote.ask)}</span>
            <span className="text-green-400">BID {fmtPrice(quote.bid)}</span>
          </div>
        )}

        <div className="ml-auto text-[10px] text-muted-foreground">
          {symbolInfo?.description}
        </div>
      </header>

      {/* ─── Main content ─────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Watchlist sidebar */}
        <aside className="hidden w-36 shrink-0 overflow-y-auto border-r border-border bg-card lg:block">
          {["forex", "commodities", "indices", "crypto"].map((cat) => {
            const items = byCategory(cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="border-b border-border">
                <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {cat}
                </div>
                {items.map((s) => (
                  <button
                    key={s.symbol}
                    onClick={() => changeSymbol(s.symbol)}
                    className={`flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-border/50 ${
                      s.symbol === symbol ? "bg-accent/10 text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="font-medium">{s.symbol}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </aside>

        {/* Chart panel */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Timeframe selector */}
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => changeTimeframe(tf)}
                className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  tf === timeframe
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tf}
              </button>
            ))}

            {/* Mobile symbol selector */}
            <select
              value={symbol}
              onChange={(e) => changeSymbol(e.target.value)}
              className="ml-auto rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground lg:hidden"
            >
              {symbols.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol}
                </option>
              ))}
            </select>
          </div>

          {/* Candle chart */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <CandleChart bars={candles?.bars ?? []} height={undefined} />
          </div>
        </div>

        {/* Right panel — DOM / Volume Profile / Heatmap */}
        <aside className="hidden w-52 shrink-0 flex-col border-l border-border bg-card xl:flex">
          {/* Panel tabs */}
          <div className="flex shrink-0 border-b border-border">
            {(["dom", "vprofile", "heatmap"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setRightPanel(p)}
                className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  rightPanel === p
                    ? "border-b-2 border-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "dom" ? "DOM" : p === "vprofile" ? "Vol Profile" : "Heatmap"}
              </button>
            ))}
          </div>

          {/* DOM */}
          {rightPanel === "dom" && dom && (
            <div className="flex-1 overflow-y-auto p-2">
              {/* Asks (reversed — highest at top, lowest closest to spread) */}
              {[...dom.asks].reverse().slice(0, 8).map((l, i) => {
                const maxSize = Math.max(...dom.asks.map((a) => a.size));
                const pct = (l.size / maxSize) * 100;
                return (
                  <div key={i} className="relative mb-px flex items-center justify-between py-0.5">
                    <div
                      className="absolute right-0 top-0 h-full bg-red-900/30"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="relative z-10 font-mono text-[10px] text-red-400">
                      {fmtPrice(l.price)}
                    </span>
                    <span className="relative z-10 font-mono text-[10px] text-muted-foreground">
                      {(l.size / 1000).toFixed(1)}K
                    </span>
                  </div>
                );
              })}

              {/* Spread */}
              <div className="my-1 flex items-center justify-center gap-1 text-[9px] text-muted-foreground">
                <span>SPREAD</span>
                <span className="font-mono text-foreground">
                  {(dom.spread / (symbolInfo?.pipSize ?? 0.0001)).toFixed(1)}
                </span>
                <span>pips</span>
              </div>

              {/* Bids */}
              {dom.bids.slice(0, 8).map((l, i) => {
                const maxSize = Math.max(...dom.bids.map((b) => b.size));
                const pct = (l.size / maxSize) * 100;
                return (
                  <div key={i} className="relative mb-px flex items-center justify-between py-0.5">
                    <div
                      className="absolute left-0 top-0 h-full bg-green-900/30"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="relative z-10 font-mono text-[10px] text-green-400">
                      {fmtPrice(l.price)}
                    </span>
                    <span className="relative z-10 font-mono text-[10px] text-muted-foreground">
                      {(l.size / 1000).toFixed(1)}K
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Volume Profile */}
          {rightPanel === "vprofile" && vprofile && (
            <div className="flex-1 overflow-y-auto p-2">
              <div className="mb-1 text-[9px] text-muted-foreground">
                POC: <span className="font-mono text-foreground">{fmtPrice(vprofile.pocPrice)}</span>
              </div>
              {[...vprofile.bars].reverse().map((bar, i) => {
                const maxVol = Math.max(...vprofile.bars.map((b) => b.volume));
                const pct = (bar.volume / maxVol) * 100;
                return (
                  <div key={i} className="mb-px flex items-center gap-1">
                    <span className="w-16 shrink-0 font-mono text-[9px] text-muted-foreground">
                      {fmtPrice(bar.price)}
                    </span>
                    <div className="flex-1">
                      <div
                        className={`h-2.5 rounded-sm ${
                          bar.isHighVolume ? "bg-accent" : "bg-border"
                        }`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Heatmap */}
          {rightPanel === "heatmap" && heatmap && (
            <div className="flex-1 overflow-hidden p-2">
              <div className="mb-1 text-[9px] text-muted-foreground">Liquidity Heatmap</div>
              <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(10, 1fr)" }}>
                {heatmap.cells.map((cell, i) => (
                  <div
                    key={i}
                    title={`${fmtPrice(cell.price)}`}
                    className="h-3 rounded-sm"
                    style={{
                      backgroundColor: `rgba(99,102,241,${cell.volume.toFixed(2)})`,
                    }}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
                <span>{fmtPrice(heatmap.priceMin)}</span>
                <span>price range</span>
                <span>{fmtPrice(heatmap.priceMax)}</span>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ─── Bottom panel ─────────────────────────────────────────────── */}
      <footer className="flex shrink-0 flex-col border-t border-border bg-card" style={{ maxHeight: 200 }}>
        {/* Panel tabs */}
        <div className="flex shrink-0 items-center border-b border-border">
          {(["macro", "news"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setBottomPanel(p)}
              className={`px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                bottomPanel === p
                  ? "border-b-2 border-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "macro" ? "Economic Calendar" : "News"}
            </button>
          ))}

          {/* AI CTA */}
          <Link
            href={`/ai?symbol=${symbol}`}
            className="ml-auto mr-3 flex items-center gap-1 rounded border border-border px-3 py-1 text-[10px] text-muted-foreground hover:border-accent hover:text-foreground"
          >
            <span className="text-accent">✦</span>
            Ask AI about {symbol}
          </Link>
        </div>

        {/* Macro events */}
        {bottomPanel === "macro" && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            {macro.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">No high-impact events in the next 3 days</div>
            ) : (
              <table className="w-full min-w-max text-xs">
                <thead>
                  <tr className="border-b border-border text-[9px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-1 text-left">Time</th>
                    <th className="px-3 py-1 text-left">Currency</th>
                    <th className="px-3 py-1 text-left">Event</th>
                    <th className="px-3 py-1 text-left">Impact</th>
                    <th className="px-3 py-1 text-right">Actual</th>
                    <th className="px-3 py-1 text-right">Forecast</th>
                    <th className="px-3 py-1 text-right">Previous</th>
                  </tr>
                </thead>
                <tbody>
                  {macro.map((evt) => (
                    <tr
                      key={evt.id}
                      className="border-b border-border/40 last:border-0 hover:bg-border/20"
                    >
                      <td className="px-3 py-1 font-mono tabular-nums text-muted-foreground">
                        {new Date(evt.eventTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-1 font-semibold">{evt.currency}</td>
                      <td className="px-3 py-1 text-foreground">{evt.title}</td>
                      <td className={`px-3 py-1 font-semibold ${IMPACT_COLOR[evt.impact]}`}>
                        {evt.impact}
                      </td>
                      <td className="px-3 py-1 text-right font-mono">{evt.actual ?? "—"}</td>
                      <td className="px-3 py-1 text-right font-mono text-muted-foreground">
                        {evt.forecast ?? "—"}
                      </td>
                      <td className="px-3 py-1 text-right font-mono text-muted-foreground">
                        {evt.previous ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* News feed */}
        {bottomPanel === "news" && (
          <div className="flex-1 overflow-y-auto">
            {news.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">No news available</div>
            ) : (
              news.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 border-b border-border/40 px-3 py-2 last:border-0"
                >
                  <span
                    className={`mt-0.5 shrink-0 text-[9px] font-semibold uppercase ${
                      SENTIMENT_COLOR[item.sentiment]
                    }`}
                  >
                    {item.sentiment}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{item.headline}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{item.summary}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">
                    {new Date(item.publishedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
