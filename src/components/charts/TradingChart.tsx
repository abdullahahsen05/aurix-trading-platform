"use client";

import { useEffect, useMemo, useState } from "react";
import { Crosshair, Maximize2, MoveHorizontal, Sparkles, ZoomIn } from "lucide-react";
import { motion } from "framer-motion";

type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D";

type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
};

const timeframes: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D"];

function buildCandles(basePrice: number, timeframe: Timeframe) {
  const multiplier =
    timeframe === "1m" ? 0.35 : timeframe === "5m" ? 0.55 : timeframe === "15m" ? 0.75 : timeframe === "1H" ? 1 : timeframe === "4H" ? 1.35 : 1.7;

  return Array.from({ length: 48 }, (_, index): Candle => {
    const drift = Math.sin(index / 4) * 8 * multiplier + index * 0.15 * multiplier;
    const volatility = Math.cos(index / 3) * 6 * multiplier;
    const open = basePrice + drift;
    const close = open + volatility * 0.4 + (index % 5 === 0 ? -4.2 * multiplier : 2.1 * multiplier);
    const high = Math.max(open, close) + 6 * multiplier + (index % 3);
    const low = Math.min(open, close) - 5 * multiplier - ((index + 1) % 2);
    return { open, high, low, close };
  });
}

function ChartTools() {
  const tools = [
    { icon: ZoomIn, label: "Zoom" },
    { icon: Crosshair, label: "Crosshair" },
    { icon: MoveHorizontal, label: "Pan" },
    { icon: Maximize2, label: "Focus" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tools.map(({ icon: Icon, label }, index) => (
        <button
          key={label}
          type="button"
          className={`btn-dark h-9 px-4 text-xs ${index === 0 ? "btn-active" : ""}`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function TradingChart() {
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [price, setPrice] = useState(2348.2);
  const [change, setChange] = useState(1.42);

  const candles = useMemo(() => buildCandles(price, timeframe), [price, timeframe]);

  const bounds = useMemo(() => {
    const values = candles.flatMap((candle) => [candle.high, candle.low]);
    return {
      min: Math.min(...values) - 4,
      max: Math.max(...values) + 4,
    };
  }, [candles]);

  const scaleY = (value: number) => {
    const range = bounds.max - bounds.min || 1;
    return 12 + ((bounds.max - value) / range) * 186;
  };

  const latest = candles[candles.length - 1];
  const trend = candles.map((candle, index) => {
    const avg = candles.slice(Math.max(0, index - 3), index + 1).reduce((sum, item) => sum + item.close, 0) /
      Math.min(index + 1, 4);
    return avg;
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPrice((current) => {
        const wave = Math.sin(Date.now() / 1800) * 2.2;
        const step = current + wave * 0.45 + (Math.random() - 0.5) * 0.8;
        return Number(step.toFixed(2));
      });
      setChange((current) => Number((current + (Math.random() - 0.5) * 0.12).toFixed(2)));
    }, 2400);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <motion.section
      layout
      className="section-surface overflow-hidden"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="status-pill px-3 py-1 text-xs">
              XAUUSD
            </span>
            <span className="text-xs font-medium text-muted">Live mock feed</span>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            <h3 className="text-lg font-semibold text-foreground">Candlestick chart</h3>
            <p className="text-sm text-muted">Trend bias, session structure, and mock live price updates.</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
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
          <ChartTools />
        </div>
      </div>

      <div className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="inner-surface bg-panel-strong p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Price</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{price.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold ${change >= 0 ? "text-accent-2" : "text-danger"}`}>
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)}%
              </p>
              <p className="mt-1 text-xs text-muted">Updated live every few seconds</p>
            </div>
          </div>

          <div className="relative mt-5 h-[340px] overflow-hidden rounded-[18px] border border-line bg-panel p-4">
            <div className="absolute inset-x-4 top-1/4 border-t border-dashed border-accent/12" />
            <div className="absolute inset-x-4 top-1/2 border-t border-dashed border-[rgba(255,255,255,0.08)]" />
            <div className="absolute inset-x-4 top-3/4 border-t border-dashed border-[rgba(255,255,255,0.08)]" />
            <div className="absolute right-4 top-4 status-pill px-3 py-1 text-xs">
              {latest.close.toFixed(2)}
            </div>

            <svg viewBox="0 0 1000 320" className="h-full w-full overflow-visible">
              <defs>
                <linearGradient id="tradeChartTrend" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#d7ff32" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#d7ff32" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline
                points={trend
                  .map((value, index) => `${12 + (index / Math.max(trend.length - 1, 1)) * 976},${scaleY(value)}`)
                  .join(" ")}
                fill="none"
                stroke="#d7ff32"
                strokeWidth="3"
                strokeOpacity="0.45"
              />
              <polyline
                points={trend
                  .map((value, index) => `${12 + (index / Math.max(trend.length - 1, 1)) * 976},${scaleY(value)}`)
                  .join(" ")}
                fill="none"
                stroke="url(#tradeChartTrend)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.18"
              />
              {candles.map((candle, index) => {
                const x = 18 + (index / candles.length) * 960;
                const bodyTop = scaleY(Math.max(candle.open, candle.close));
                const bodyBottom = scaleY(Math.min(candle.open, candle.close));
                const wickTop = scaleY(candle.high);
                const wickBottom = scaleY(candle.low);
                const positive = candle.close >= candle.open;
                const bodyColor = positive ? "#25e6bf" : "#8a7cff";
                const wickColor = positive ? "#5bedd0" : "#9f92ff";
                const bodyX = x - 6.5;
                const bodyWidth = 13;
                const bodyHeight = Math.max(bodyBottom - bodyTop, 5);
                return (
                  <g key={index}>
                    <line
                      x1={x}
                      x2={x}
                      y1={wickTop}
                      y2={wickBottom}
                      stroke={wickColor}
                      strokeOpacity="0.82"
                      strokeWidth="1.6"
                    />
                    <rect
                      x={bodyX}
                      y={bodyTop}
                      width={bodyWidth}
                      height={bodyHeight}
                      rx="3"
                      fill={bodyColor}
                    />
                    <rect x={bodyX + 1} y={bodyTop + 1} width={bodyWidth - 2} height={Math.max(bodyHeight - 2, 1)} rx="2.5" fill={positive ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)"} />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="inner-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">WebSocket</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-30" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Connected</p>
                <p className="text-xs text-muted">Mock price feed updating the chart.</p>
              </div>
            </div>
          </div>

          <div className="inner-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Trend</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Bias is constructive</p>
                <p className="text-xs leading-5 text-muted">Price is holding above the session midline.</p>
              </div>
            </div>
          </div>

          <div className="inner-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Tools</p>
            <p className="mt-3 text-sm leading-6 text-muted">
              Zoom, crosshair, and pan controls are visual for the frontend phase and will connect to live chart actions next.
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
