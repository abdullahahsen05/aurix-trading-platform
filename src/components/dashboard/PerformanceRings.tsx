"use client";

import { motion } from "framer-motion";

type RingTone = "yellow" | "lime";

export type PerformanceRingItem = {
  label: string;
  value: string;
  caption: string;
  progress: number;
  tone?: RingTone;
};

const ease = [0.22, 1, 0.36, 1] as const;

const ringColors: Record<RingTone, string> = {
  yellow: "#ffcf00",
  lime: "#d7ff32",
};

export function PerformanceRings({ items }: { items: PerformanceRingItem[] }) {
  const columnsClass =
    items.length === 3
      ? "xl:grid-cols-3"
      : items.length === 4
        ? "xl:grid-cols-4"
        : "xl:grid-cols-5";

  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${columnsClass}`}>
      {items.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: index * 0.05, ease }}
          className="rounded-2xl p-2"
        >
          <div className="flex justify-center">
            <div className="relative h-40 w-40">
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  borderRadius: "50%",
                  backgroundImage: `conic-gradient(from 180deg, ${ringColors[item.tone ?? "yellow"]} 0deg ${
                    Math.max(0, Math.min(item.progress, 1)) * 360
                  }deg, #151515 ${Math.max(0, Math.min(item.progress, 1)) * 360}deg 360deg)`,
                  boxShadow:
                    item.tone === "lime"
                      ? "0 0 18px rgba(215,255,50,0.14)"
                      : "0 0 18px rgba(255,207,0,0.18)",
                  filter:
                    item.tone === "lime"
                      ? "drop-shadow(0 0 10px rgba(215,255,50,0.12))"
                      : "drop-shadow(0 0 10px rgba(255,207,0,0.15))",
                }}
              />
              <div
                className="absolute inset-[14px] border border-line bg-background"
                style={{ borderRadius: "50%" }}
              />
              <div className="absolute inset-[28px] grid place-items-center text-center">
                <div>
                  <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
                    {item.caption}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-sm font-semibold text-foreground">{item.label}</p>
        </motion.div>
      ))}
    </div>
  );
}
