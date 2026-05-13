"use client";

import { motion } from "framer-motion";
import { AlertTriangle, RefreshCcw, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { GhostButton, PrimaryButton } from "@/components/app/WorkspaceUI";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-panel-strong/80 ${className}`} />;
}

export function WorkspaceLoadingState({
  eyebrow = "Loading",
  title = "Preparing workspace",
  description = "Loading the latest account, CRM, risk, and analytics data.",
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  return (
    <section className="mx-auto max-w-[1440px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-accent">{eyebrow}</p>
          <SkeletonBlock className="mt-3 h-8 w-72 max-w-full" />
          <SkeletonBlock className="mt-3 h-4 w-[36rem] max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-36 rounded-full" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[0.64fr_0.36fr]">
        <SkeletonBlock className="h-[28rem] rounded-2xl" />
        <SkeletonBlock className="h-[28rem] rounded-2xl" />
      </div>
      <div className="mt-5">
        <SkeletonBlock className="h-[26rem] rounded-2xl" />
      </div>
      <p className="mt-5 text-sm text-muted">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </section>
  );
}

export function AuthLoadingState() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-line bg-panel p-6">
        <SkeletonBlock className="h-10 w-28" />
        <SkeletonBlock className="mt-8 h-8 w-48" />
        <SkeletonBlock className="mt-3 h-4 w-full" />
        <div className="mt-7 grid gap-4">
          <SkeletonBlock className="h-12 w-full rounded-xl" />
          <SkeletonBlock className="h-12 w-full rounded-xl" />
        </div>
        <div className="mt-6 flex items-center justify-between gap-4">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-11 w-28 rounded-full" />
        </div>
      </section>
    </main>
  );
}

export function WorkspaceErrorState({
  title = "Workspace unavailable",
  description = "We hit an unexpected rendering issue while loading this section.",
  retryLabel = "Try again",
  unstable_retry,
}: {
  title?: string;
  description?: string;
  retryLabel?: string;
  unstable_retry: () => void;
}) {
  return (
    <section className="mx-auto grid min-h-[60vh] max-w-3xl place-items-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full rounded-3xl border border-line bg-panel p-6 shadow-[0_18px_48px_rgba(0,0,0,0.3)]"
      >
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-danger/10 text-danger">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-danger">Error</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <PrimaryButton type="button" onClick={unstable_retry}>
                <RefreshCcw className="mr-2 inline-block h-4 w-4" />
                {retryLabel}
              </PrimaryButton>
              <GhostButton type="button" onClick={unstable_retry}>
                Refresh segment
              </GhostButton>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

export function AuthErrorState({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-line bg-panel p-6">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-danger/10 text-danger">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-foreground">Authentication screen failed</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          We could not render this auth flow. Try again and the page will re-fetch.
        </p>
        <div className="mt-6 flex gap-3">
          <GhostButton type="button" onClick={unstable_retry}>
            Retry
          </GhostButton>
          <PrimaryButton type="button" onClick={unstable_retry}>
            <RefreshCcw className="mr-2 inline-block h-4 w-4" />
            Reload
          </PrimaryButton>
        </div>
      </section>
    </main>
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
    <div className="rounded-2xl border border-dashed border-line bg-panel/70 p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
