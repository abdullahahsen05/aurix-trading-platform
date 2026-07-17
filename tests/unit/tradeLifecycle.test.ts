import { describe, expect, test } from "vitest";
import { mapTradeToDto } from "@/lib/mappers/tradeMapper";
import { isClosingDeal } from "@/lib/services/brokerSyncService";

describe("trade lifecycle mapping", () => {
  test("maps the stored display ID and close fields", () => {
    const trade = mapTradeToDto({
      id: "3b6a3426-b42c-4f9c-a15e-b0331af5b899",
      short_trade_id: "TRD-00000142",
      trading_account_id: "account-1",
      symbol: "EURUSD",
      side: "BUY",
      status: "CLOSED",
      volume: 1,
      open_price: 1.08,
      close_price: 1.09,
      profit: 100,
      currency: "USD",
      opened_at: "2026-07-14T10:00:00.000Z",
      closed_at: "2026-07-14T11:00:00.000Z",
    });

    expect(trade.shortTradeId).toBe("TRD-00000142");
    expect(trade.closePrice).toBe(1.09);
    expect(trade.closedAt).toBe("2026-07-14T11:00:00.000Z");
    expect(trade.id).toBe("3b6a3426-b42c-4f9c-a15e-b0331af5b899");
  });

  test("gives pre-migration rows a stable display fallback", () => {
    const trade = mapTradeToDto({
      id: "3b6a3426-b42c-4f9c-a15e-b0331af5b899",
      short_trade_id: null,
      trading_account_id: "account-1",
      symbol: "EURUSD",
      side: "BUY",
      status: "OPEN",
      volume: 1,
      open_price: 1.08,
      close_price: null,
      profit: 0,
      currency: "USD",
      opened_at: "2026-07-14T10:00:00.000Z",
      closed_at: null,
    });

    expect(trade.shortTradeId).toBe("TRD-3B6A3426");
    expect(trade.closePrice).toBeNull();
    expect(trade.closedAt).toBeNull();
  });

  test("recognizes normal and close-by MetaTrader exits", () => {
    expect(isClosingDeal("DEAL_ENTRY_OUT")).toBe(true);
    expect(isClosingDeal("DEAL_ENTRY_OUT_BY")).toBe(true);
    expect(isClosingDeal("DEAL_ENTRY_IN")).toBe(false);
  });
});
