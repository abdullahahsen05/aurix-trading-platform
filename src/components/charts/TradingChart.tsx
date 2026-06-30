"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import {
  TradingViewAdvancedChart,
  TRADING_VIEW_SYMBOLS,
} from "@/components/trading/TradingViewAdvancedChart";

type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D";

const timeframes: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D"];

// Map Aurix timeframe labels to TradingView interval strings
const INTERVAL_MAP: Record<Timeframe, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1H": "60",
  "4H": "240",
  "1D": "D",
};

export function TradingChart() {
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");

  const tvSymbol = TRADING_VIEW_SYMBOLS.XAUUSD;
  const tvInterval = INTERVAL_MAP[timeframe];

  return (
    <motion.section layout className="section-surface overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="status-pill px-3 py-1 text-xs">XAUUSD</span>
            <span className="text-xs font-medium text-muted">
              TradingView live chart
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            <h3 className="text-lg font-semibold text-foreground">
              Advanced chart
            </h3>
            <p className="text-sm text-muted">
              TradingView market chart embedded for live visual analysis.
            </p>
          </div>
        </div>

        {/* Timeframe selector — wired to TradingView interval */}
        <div className="flex flex-wrap gap-2">
          {timeframes.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTimeframe(item)}
              className={`btn-dark h-9 px-4 text-xs ${timeframe === item ? "btn-active" : ""}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* TradingView widget */}
        <TradingViewAdvancedChart
          symbol={tvSymbol}
          interval={tvInterval}
          height="520px"
          theme="dark"
        />

        {/* Right info column */}
        <div className="grid gap-3">
          <div className="inner-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
              Data source
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-30" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  TradingView
                </p>
                <p className="text-xs text-muted">
                  Live market data via embedded widget.
                </p>
              </div>
            </div>
          </div>

          <div className="inner-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
              Trend
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Bias is constructive
                </p>
                <p className="text-xs leading-5 text-muted">
                  Price holding above session midline.
                </p>
              </div>
            </div>
          </div>

          <div className="inner-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
              Chart controls
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              Use TradingView&apos;s built-in toolbar for zoom, crosshair,
              drawing tools, and indicators.
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
