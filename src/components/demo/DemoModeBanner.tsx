"use client";

import { Panel } from "@/components/app/WorkspaceUI";

export function DemoModeBanner() {
  return (
    <Panel className="mb-5 border border-accent/30 bg-accent/5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Demo Mode</p>
      <h2 className="mt-2 text-lg font-semibold text-foreground">Demo Mode — sample data only</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        No real trades, payments, broker actions, AI calls, or external market feeds are performed in this demo.
      </p>
    </Panel>
  );
}
