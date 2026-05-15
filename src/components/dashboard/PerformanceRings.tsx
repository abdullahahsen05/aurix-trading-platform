"use client";

import { motion } from "framer-motion";
import { StatusPill } from "@/components/app/WorkspaceUI";

type RingTone = "yellow" | "lime";
type RingStatusTone = "accent" | "lime" | "muted" | "danger";

export type PerformanceRingItem = {
  label: string;
  value: string;
  status: string;
  statusTone: RingStatusTone;
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
          className="card-surface min-h-[272px] p-4"
        >
          <div className="flex justify-center pt-1">
            <div className="relative h-44 w-44">
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  borderRadius: "50%",
                  backgroundImage: `conic-gradient(from 180deg, ${ringColors[item.tone ?? "yellow"]} 0deg ${
                    Math.max(0, Math.min(item.progress, 1)) * 360
                  }deg, #181818 ${Math.max(0, Math.min(item.progress, 1)) * 360}deg 360deg)`,
                }}
              />
              <div
                className="absolute inset-[15px] border border-line bg-background"
                style={{ borderRadius: "50%" }}
              />
              <div className="absolute inset-[28px] grid place-items-center text-center">
                <div>
                  <p className="text-[27px] font-semibold text-foreground">{item.value}</p>
                  <div className="mt-2 flex justify-center">
                    <StatusPill tone={item.statusTone}>{item.status}</StatusPill>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-5 text-center text-sm font-semibold text-foreground">{item.label}</p>
        </motion.div>
      ))}
    </div>
  );
}
