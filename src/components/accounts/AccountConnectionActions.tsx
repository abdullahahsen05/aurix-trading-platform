"use client";

import { StatusPill } from "@/components/app/WorkspaceUI";

const STATUS_TONE: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  CONNECTED: "lime",
  SYNCING: "accent",
  DISCONNECTED: "danger",
  RESTRICTED: "danger",
  PENDING: "muted",
};

export function AccountConnectionActions({
  status,
  compact = false,
}: {
  accountName: string;
  status: string;
  compact?: boolean;
}) {
  const tone = STATUS_TONE[status] ?? "muted";

  if (compact) {
    return <StatusPill tone={tone}>{status}</StatusPill>;
  }

  return (
    <div className="flex items-center gap-3">
      <StatusPill tone={tone}>{status}</StatusPill>
      <p className="text-xs text-muted">Use the Broker connection panel below to sync or verify.</p>
    </div>
  );
}
