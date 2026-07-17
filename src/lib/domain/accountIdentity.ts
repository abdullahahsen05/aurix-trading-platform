import type { TraderAccountSummary } from "@/lib/domain/types";

export const BROKER_DISPLAY_FALLBACK = "WSA GLOBAL";

export function getAccountDisplayIdentity(account: TraderAccountSummary | undefined) {
  return {
    brokerName: account?.brokerName?.trim() || BROKER_DISPLAY_FALLBACK,
    serverName: account?.serverName?.trim() || "Server pending sync",
    platform: account?.platform ?? "MetaTrader",
  };
}
