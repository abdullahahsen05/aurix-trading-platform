import { trades, tradingAccounts } from "@/lib/data/mockData";
import type { TradeDto, TraderAccountSummary } from "@/lib/domain/types";
import type {
  BrokerAdapter,
  BrokerConnectionHealth,
  BrokerExecutionResult,
  CloseTradeRequest,
  ModifyTradeRequest,
  OpenTradeRequest,
} from "./BrokerAdapter";

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

  // Execution is available in the mock adapter for tests/dev only. Live copy
  // always uses the real provider adapter, never this one.
  executionAvailable(): boolean {
    return true;
  }

  async openTrade(req: OpenTradeRequest): Promise<BrokerExecutionResult> {
    return {
      ok: true,
      brokerOrderId: `MOCK-ORD-${Date.now()}`,
      brokerPositionId: `MOCK-POS-${Date.now()}`,
      executedVolume: req.volume,
      rawResponse: { mock: true },
    };
  }

  async closeTrade(req: CloseTradeRequest): Promise<BrokerExecutionResult> {
    return { ok: true, brokerPositionId: req.brokerPositionId, executedVolume: req.volume ?? 0, rawResponse: { mock: true } };
  }

  async modifyTrade(req: ModifyTradeRequest): Promise<BrokerExecutionResult> {
    return { ok: true, brokerPositionId: req.brokerPositionId, rawResponse: { mock: true } };
  }
}
