/**
 * Market Data Service — provider selection layer
 *
 * Reads MARKET_DATA_PROVIDER env var at runtime.
 * Default: "mock"
 * To use dxFeed: set MARKET_DATA_PROVIDER=dxfeed and all DXFEED_* vars.
 *
 * The dxFeed provider gracefully falls back to an error response when
 * credentials are missing — the API routes catch that and surface a clear label.
 */

import { MockMarketDataProvider } from "./providers/mockMarketDataProvider";
import { DxfeedMarketDataProvider } from "./providers/dxfeedMarketDataProvider";
import type { BaseMarketDataProvider } from "./providers/baseMarketDataProvider";

let _instance: BaseMarketDataProvider | null = null;

export function getMarketDataProvider(): BaseMarketDataProvider {
  if (_instance) return _instance;

  const providerEnv = process.env.MARKET_DATA_PROVIDER ?? "mock";

  if (providerEnv === "dxfeed") {
    _instance = new DxfeedMarketDataProvider();
  } else {
    _instance = new MockMarketDataProvider();
  }

  return _instance;
}

/** For testing — reset singleton so a different provider can be injected */
export function resetMarketDataProvider(): void {
  _instance = null;
}
