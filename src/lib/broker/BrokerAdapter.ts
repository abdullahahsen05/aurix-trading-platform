import type { TradeDto, TraderAccountSummary } from "@/lib/domain/types";

export interface BrokerConnectionHealth {
  ok: boolean;
  provider: string;
  message: string;
}

export interface BrokerAdapter {
  verifyConnection(accountId: string): Promise<BrokerConnectionHealth>;
  fetchSnapshot(accountId: string): Promise<TraderAccountSummary>;
  fetchOpenTrades(accountId: string): Promise<TradeDto[]>;
  fetchTradeHistory(accountId: string): Promise<TradeDto[]>;
}

export class BrokerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerConfigurationError";
  }
}
