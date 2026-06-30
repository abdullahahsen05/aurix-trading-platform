import type { TradeDto, TraderAccountSummary } from "@/lib/domain/types";

export interface BrokerConnectionHealth {
  ok: boolean;
  provider: string;
  message: string;
}

export interface OpenTradeRequest {
  accountId: string;
  symbol: string;
  side: "BUY" | "SELL";
  volume: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  comment?: string | null;
  magic?: number | null;
  slippage?: number | null;
}

export interface CloseTradeRequest {
  accountId: string;
  brokerPositionId: string;
  symbol?: string;
  volume?: number | null;
  comment?: string | null;
}

export interface ModifyTradeRequest {
  accountId: string;
  brokerPositionId: string;
  stopLoss?: number | null;
  takeProfit?: number | null;
}

export interface BrokerExecutionResult {
  ok: boolean;
  brokerOrderId?: string;
  brokerPositionId?: string;
  executedVolume?: number;
  executedPrice?: number;
  rawResponse?: unknown;
}

export interface BrokerAdapter {
  verifyConnection(accountId: string): Promise<BrokerConnectionHealth>;
  fetchSnapshot(accountId: string): Promise<TraderAccountSummary>;
  fetchOpenTrades(accountId: string): Promise<TradeDto[]>;
  fetchTradeHistory(accountId: string): Promise<TradeDto[]>;

  // ── Order execution (copy trading). Default-off; see MetaApiBrokerAdapter. ──
  /** True only when real order execution is wired AND explicitly enabled by env. */
  executionAvailable(): boolean;
  openTrade(req: OpenTradeRequest): Promise<BrokerExecutionResult>;
  closeTrade(req: CloseTradeRequest): Promise<BrokerExecutionResult>;
  modifyTrade(req: ModifyTradeRequest): Promise<BrokerExecutionResult>;
}

export class BrokerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerConfigurationError";
  }
}
