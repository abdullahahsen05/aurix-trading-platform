"use client";

import { useEffect, useRef } from "react";
import type { CandleBar } from "@/lib/terminal/types";

interface Props {
  bars: CandleBar[];
  /** Fixed pixel height. If omitted, fills the container height via CSS. */
  height?: number;
}

export default function CandleChart({ bars, height = 380 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    let cleanup: (() => void) | undefined;

    import("lightweight-charts").then(({ createChart, CandlestickSeries }) => {
      const container = containerRef.current;
      if (!container) return;

      const chartHeight = height ?? container.clientHeight ?? 380;

      const chart = createChart(container, {
        layout: {
          background: { color: "transparent" },
          textColor: "#9ca3af",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#1f2937" },
          horzLines: { color: "#1f2937" },
        },
        crosshair: {
          vertLine: { color: "#374151", labelBackgroundColor: "#111827" },
          horzLine: { color: "#374151", labelBackgroundColor: "#111827" },
        },
        width: container.clientWidth,
        height: chartHeight,
        rightPriceScale: { borderColor: "#1f2937" },
        timeScale: {
          borderColor: "#1f2937",
          timeVisible: true,
          secondsVisible: false,
        },
      });

      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });

      series.setData(
        bars.map((b) => ({
          time: b.time as import("lightweight-charts").UTCTimestamp,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        }))
      );

      chart.timeScale().fitContent();

      const ro = new ResizeObserver(() => {
        if (container) {
          chart.applyOptions({
            width: container.clientWidth,
            height: height ?? container.clientHeight ?? 380,
          });
        }
      });
      ro.observe(container);

      cleanup = () => {
        ro.disconnect();
        chart.remove();
      };
    });

    return () => { cleanup?.(); };
  }, [bars, height]);

  if (bars.length === 0) {
    return (
      <div
        style={{ width: "100%", height: height ?? "100%" }}
        className="flex items-center justify-center text-sm text-muted-foreground"
      >
        Loading chart data…
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: "100%", height: height ?? "100%" }} />;
}
