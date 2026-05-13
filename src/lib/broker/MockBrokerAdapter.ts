import { trades, tradingAccounts } from "@/lib/data/mockData";
import type { TradeDto, TraderAccountSummary } from "@/lib/domain/types";
import type { BrokerAdapter, BrokerConnectionHealth } from "./BrokerAdapter";

export class MockBrokerAdapter implements BrokerAdapter {
  async verifyConnection(accountId: string): Promise<BrokerConnectionHealth> {
    const account = tradingAccounts.find((item) => item.accountId === accountId);
    return {
      ok: Boolean(account),
      provider: "mock",
      message: account ? "Mock broker connection healthy." : "Mock account not found.",
    };
  }

  async fetchSnapshot(accountId: string): Promise<TraderAccountSummary> {
    const account = tradingAccounts.find((item) => item.accountId === accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    const pulse = Math.sin(Date.now() / 30000) * 24;
    return {
      ...account,
      equity: {
        ...account.equity,
        amount: Number((account.equity.amount + pulse).toFixed(2)),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async fetchOpenTrades(accountId: string): Promise<TradeDto[]> {
    return trades.filter((trade) => trade.accountId === accountId && trade.status === "OPEN");
  }

  async fetchTradeHistory(accountId: string): Promise<TradeDto[]> {
    return trades.filter((trade) => trade.accountId === accountId && trade.status === "CLOSED");
  }
}
