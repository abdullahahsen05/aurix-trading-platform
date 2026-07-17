import { describe, expect, test } from "vitest";
import { BROKER_DISPLAY_FALLBACK, getAccountDisplayIdentity } from "@/lib/domain/accountIdentity";
import type { TraderAccountSummary } from "@/lib/domain/types";

const baseAccount: TraderAccountSummary = {
  accountId: "account-1",
  accountName: "Primary",
  brokerName: "Meta Broker",
  serverName: "MetaBroker-Live",
  platform: "MT5",
  status: "CONNECTED",
  balance: { amount: 0, currency: "USD" },
  equity: { amount: 0, currency: "USD" },
  floatingPnl: { amount: 0, currency: "USD" },
  openTradeCount: 0,
  drawdownPercent: 0,
  updatedAt: new Date(0).toISOString(),
};

describe("account display identity", () => {
  test("shows stored broker, server, and platform metadata", () => {
    expect(getAccountDisplayIdentity(baseAccount)).toEqual({
      brokerName: "Meta Broker",
      serverName: "MetaBroker-Live",
      platform: "MT5",
    });
  });

  test("uses WSA GLOBAL only as the broker display fallback", () => {
    expect(getAccountDisplayIdentity({ ...baseAccount, brokerName: "", serverName: null, platform: null })).toEqual({
      brokerName: BROKER_DISPLAY_FALLBACK,
      serverName: "Server pending sync",
      platform: "MetaTrader",
    });
  });
});
