/**
 * dxFeed Market Data Provider — Skeleton
 *
 * This file is a structural placeholder. All methods that require the actual
 * dxFeed API are marked with TODO. No undocumented endpoints are guessed.
 *
 * To activate:
 *   1. Obtain API credentials and documentation from dxFeed / Devexperts
 *   2. Set MARKET_DATA_PROVIDER=dxfeed in your environment
 *   3. Set DXFEED_API_BASE_URL, DXFEED_API_KEY, DXFEED_ACCOUNT_ID
 *   4. Implement the TODO sections below using the official API contract
 *
 * Security: DXFEED_API_KEY is never sent to the browser. All requests
 * originate server-side from these API route handlers only.
 */

import { BaseMarketDataProvider } from "./baseMarketDataProvider";
import type {
  ProviderStatus,
  SymbolInfo,
  QuoteData,
  CandleData,
  DomData,
  HeatmapData,
  VolumeProfileData,
  NewsItem,
  Timeframe,
} from "../types";

const API_BASE = process.env.DXFEED_API_BASE_URL ?? "";
const API_KEY = process.env.DXFEED_API_KEY ?? "";
const ACCOUNT_ID = process.env.DXFEED_ACCOUNT_ID ?? "";

function isConfigured(): boolean {
  return Boolean(API_BASE && API_KEY && ACCOUNT_ID);
}

export class DxfeedMarketDataProvider extends BaseMarketDataProvider {
  async getStatus(): Promise<ProviderStatus> {
    if (!isConfigured()) {
      return {
        provider: "dxfeed",
        mode: "demo",
        connected: false,
        label: "Demo Market Data",
        error: "dxFeed credentials not configured — falling back to demo mode",
      };
    }

    try {
      // TODO: dxFeed docs required — implement health-check / ping endpoint
      // Example (endpoint URL is a placeholder, verify with official docs):
      //   const resp = await fetch(`${API_BASE}/health`, {
      //     headers: { Authorization: `Bearer ${API_KEY}` },
      //   });
      //   if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      throw new Error("dxFeed health-check endpoint not yet implemented — update this file with official API docs");
    } catch (err) {
      return {
        provider: "dxfeed",
        mode: "demo",
        connected: false,
        label: "Demo Market Data",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async getSymbols(): Promise<SymbolInfo[]> {
    if (!isConfigured()) return [];

    // TODO: dxFeed docs required — implement symbols/instruments list endpoint
    // Replace the lines below with actual API call once API contract is available.
    throw new Error("dxFeed getSymbols not yet implemented");
  }

  async getQuote(symbol: string): Promise<QuoteData> {
    if (!isConfigured()) throw new Error("dxFeed not configured");

    // TODO: dxFeed docs required — implement real-time quote endpoint
    // The DXFEED_API_KEY must be sent in a server-side header only.
    // Never include it in client-side requests.
    throw new Error(`dxFeed getQuote(${symbol}) not yet implemented`);
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 100): Promise<CandleData> {
    if (!isConfigured()) throw new Error("dxFeed not configured");

    // TODO: dxFeed docs required — implement historical OHLCV candle endpoint
    // Map our Timeframe type to whatever period notation dxFeed uses.
    throw new Error(`dxFeed getCandles(${symbol}, ${timeframe}, ${limit}) not yet implemented`);
  }

  async getDom(symbol: string): Promise<DomData> {
    if (!isConfigured()) throw new Error("dxFeed not configured");

    // TODO: dxFeed docs required — implement Level 2 / Order Book endpoint
    throw new Error(`dxFeed getDom(${symbol}) not yet implemented`);
  }

  async getHeatmap(symbol: string): Promise<HeatmapData> {
    if (!isConfigured()) throw new Error("dxFeed not configured");

    // TODO: dxFeed docs required — implement liquidity heatmap / time-and-sales data
    throw new Error(`dxFeed getHeatmap(${symbol}) not yet implemented`);
  }

  async getVolumeProfile(symbol: string): Promise<VolumeProfileData> {
    if (!isConfigured()) throw new Error("dxFeed not configured");

    // TODO: dxFeed docs required — implement volume-by-price / TPO data endpoint
    throw new Error(`dxFeed getVolumeProfile(${symbol}) not yet implemented`);
  }

  async getNews(symbol?: string): Promise<NewsItem[]> {
    if (!isConfigured()) return [];

    // TODO: dxFeed docs required — implement news feed endpoint (if provided)
    // dxFeed may not include a news feed; integrate a separate provider if needed.
    void symbol;
    return [];
  }
}
