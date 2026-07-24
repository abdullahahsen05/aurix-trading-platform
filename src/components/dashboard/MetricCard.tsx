import type { ComponentType } from "react";

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "neutral",
  delta,
}: {
  label: string;
  value: string;
  helper: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: "neutral" | "positive" | "warning";
  delta?: string;
}) {
  const toneClass =
    tone === "positive" ? "text-accent" : tone === "warning" ? "text-accent-2" : "text-foreground";

  return (
    <article className="group rounded-lg border border-line bg-panel p-4 shadow-[0_20px_60px_rgba(0,0,0,0.16)] transition duration-200  hover:border-accent/45">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        {Icon ? (
          <span className="grid h-9 w-9 place-items-center rounded-md border border-line bg-background text-muted group-hover:text-accent">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
        {delta ? <span className="rounded-md bg-panel-strong px-2 py-1 text-xs text-accent">{delta}</span> : null}
      </div>
      <p className="mt-2 text-xs text-muted">{helper}</p>
    </article>
  );
}
