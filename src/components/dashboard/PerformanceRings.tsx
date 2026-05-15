"use client";

import { motion } from "framer-motion";
import { StatusPill } from "@/components/app/WorkspaceUI";

type RingTone = "yellow" | "lime";
type RingStatusTone = "accent" | "lime" | "muted";

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
          className="rounded-[20px] border border-line bg-panel/90 p-4 shadow-[0_1px_0_rgba(255,255,255,0.02)]"
        >
          <div className="flex justify-center">
            <div className="relative h-36 w-36">
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  borderRadius: "50%",
                  backgroundImage: `conic-gradient(from 180deg, ${ringColors[item.tone ?? "yellow"]} 0deg ${
                    Math.max(0, Math.min(item.progress, 1)) * 360
                  }deg, #151515 ${Math.max(0, Math.min(item.progress, 1)) * 360}deg 360deg)`,
                }}
              />
              <div
                className="absolute inset-[13px] border border-line bg-background"
                style={{ borderRadius: "50%" }}
              />
              <div className="absolute inset-[24px] grid place-items-center text-center">
                <div>
                  <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                  <div className="mt-2 flex justify-center">
                    <StatusPill tone={item.statusTone}>{item.status}</StatusPill>
                  </div>
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
