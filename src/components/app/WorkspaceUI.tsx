"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { Sparkles } from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;

export const controlClassName =
  "h-12 w-full rounded-xl border border-line bg-background px-4 text-sm text-foreground outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/10";

export const textareaClassName =
  "min-h-28 w-full rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/10";

export const selectClassName =
  "h-12 w-full rounded-xl border border-line bg-background px-4 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10";

export const pageMotion = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.03,
    },
  },
};

export const itemMotion = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease },
  },
};

export function WorkspacePage({
  title,
  description,
  eyebrow,
  action,
  children,
}: {
  title: string;
  description: string;
  eyebrow: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.section
      variants={pageMotion}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-[1440px]"
    >
      <motion.div variants={itemMotion} className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-accent">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-muted">{description}</p>
        </div>
        {action}
      </motion.div>
      {children}
    </motion.section>
  );
}

export function PageActionGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function FilterChipRow({
  chips,
}: {
  chips: Array<{
    label: string;
    active: boolean;
    onClick: () => void;
  }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={chip.onClick}
          aria-pressed={chip.active}
          className={`btn-dark ${chip.active ? "btn-active" : ""}`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={itemMotion}
      className={`card-surface p-5 ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function StatTile({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string | number;
  helper?: string;
  tone?: "default" | "accent" | "lime" | "danger";
}) {
  const toneClass =
    tone === "accent"
      ? "text-accent"
      : tone === "lime"
        ? "text-accent-2"
        : tone === "danger"
          ? "text-danger"
          : "text-foreground";

  return (
    <motion.div
      variants={itemMotion}
      whileHover={{ y: -2, borderColor: "rgba(255,207,0,0.35)" }}
      className="card-surface p-5 transition-colors"
    >
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`mt-3 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {helper ? <p className="mt-2 text-xs font-medium text-muted">{helper}</p> : null}
    </motion.div>
  );
}

export function InlineStatusStrip({
  items,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    helper?: ReactNode;
    tone?: "default" | "accent" | "lime" | "danger";
  }>;
  }) {
  return (
    <div className="section-surface p-2">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const toneClass =
            item.tone === "accent"
              ? "text-accent"
              : item.tone === "lime"
                ? "text-accent-2"
                : item.tone === "danger"
                  ? "text-danger"
                  : "text-foreground";

          return (
            <div
              key={item.label}
              className="inner-surface flex min-w-[220px] flex-1 items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {item.label}
                </p>
                {item.helper ? (
                  <p className="mt-1 truncate text-xs font-medium text-muted">{item.helper}</p>
                ) : null}
              </div>
              <p className={`shrink-0 text-base font-semibold ${toneClass}`}>{item.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StatusPill({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "lime" | "muted" | "danger";
}) {
  const toneClass =
    tone === "lime"
      ? "status-pill status-pill-green"
      : tone === "danger"
        ? "status-pill border-danger/20 bg-danger/10 text-danger"
        : tone === "muted"
          ? "status-pill border-line bg-panel-strong text-muted"
          : "status-pill";

  return (
    <span className={toneClass}>{children}</span>
  );
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="section-surface overflow-x-auto p-4">
      <table className="w-full min-w-[780px] text-left text-sm">
        <thead className="bg-panel-strong text-xs font-semibold text-foreground/90">
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                className={`px-4 py-3 ${
                  index === 0 ? "rounded-l-lg" : index === headers.length - 1 ? "rounded-r-lg" : ""
                }`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <motion.tr
              key={rowIndex}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.32, delay: 0.12 + rowIndex * 0.035, ease }}
              className="border-t border-line/80"
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-4 text-foreground/80">
                  {cell}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrimaryButton({
  children,
  ...props
}: HTMLMotionProps<"button"> & { children: ReactNode }) {
  return (
    <motion.button
      {...props}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      className="btn-dark btn-active disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </motion.button>
  );
}

export function GhostButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className="btn-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function FieldShell({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-muted">
      <span className="label-text">{label}</span>
      {children}
      {hint ? <span className="text-xs font-medium leading-5 text-muted">{hint}</span> : null}
      {error ? <span className="text-xs font-semibold text-danger">{error}</span> : null}
    </label>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = Sparkles,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: typeof Sparkles;
}) {
  const Icon = icon;

  return (
    <div className="card-surface border-dashed p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
