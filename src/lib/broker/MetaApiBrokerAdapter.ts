import type { TradeDto, TraderAccountSummary } from "@/lib/domain/types";
import {
  BrokerConfigurationError,
  type BrokerAdapter,
  type BrokerConnectionHealth,
} from "./BrokerAdapter";

export class MetaApiBrokerAdapter implements BrokerAdapter {
  private readonly token = process.env.METAAPI_TOKEN;

  private assertConfigured() {
    if (!this.token) {
      throw new BrokerConfigurationError("METAAPI_TOKEN is not configured.");
    }
  }

  async verifyConnection(): Promise<BrokerConnectionHealth> {
    this.assertConfigured();
    return {
      ok: true,
      provider: "metaapi",
      message: "MetaApi adapter is configured. Live API calls are not implemented yet.",
    };
  }

  async fetchSnapshot(): Promise<TraderAccountSummary> {
    this.assertConfigured();
    throw new Error("MetaApi snapshot fetch is pending credential-backed implementation.");
  }

  async fetchOpenTrades(): Promise<TradeDto[]> {
    this.assertConfigured();
    throw new Error("MetaApi open trade fetch is pending credential-backed implementation.");
  }

  async fetchTradeHistory(): Promise<TradeDto[]> {
    this.assertConfigured();
    throw new Error("MetaApi trade history fetch is pending credential-backed implementation.");
  }
}
