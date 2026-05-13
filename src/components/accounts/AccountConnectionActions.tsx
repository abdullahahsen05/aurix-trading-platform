"use client";

import { useState } from "react";
import { GhostButton, PrimaryButton } from "@/components/app/WorkspaceUI";

export function AccountConnectionActions({
  accountName,
  status,
  compact = false,
}: {
  accountName: string;
  status: string;
  compact?: boolean;
}) {
  const [message, setMessage] = useState("");

  const handleDisconnect = () => {
    setMessage(`Disconnect queued for ${accountName}.`);
  };

  const handleRefresh = () => {
    setMessage(
      status === "CONNECTED"
        ? `Connection health check sent for ${accountName}.`
        : `Reconnection queued for ${accountName}.`,
    );
  };

  return (
    <div className={`grid ${compact ? "gap-3" : "gap-4"}`}>
      {message ? (
        <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {message}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <GhostButton type="button" onClick={handleDisconnect}>
          Disconnect account
        </GhostButton>
        <PrimaryButton type="button" onClick={handleRefresh}>
          {status === "CONNECTED" ? "Refresh status" : "Reconnect"}
        </PrimaryButton>
      </div>
      {compact ? null : (
        <p className="text-xs font-medium leading-5 text-muted">
          These controls are wired to mock feedback only until broker integration is connected.
        </p>
      )}
    </div>
  );
}
