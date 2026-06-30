import { BaseMarketDataProvider } from "./baseMarketDataProvider";
import type {
  ProviderStatus,
  SymbolInfo,
  QuoteData,
  CandleData,
  CandleBar,
  DomData,
  HeatmapData,
  VolumeProfileData,
  NewsItem,
  Timeframe,
} from "../types";

const BASE_PRICES: Record<string, number> = {
  EURUSD: 1.0852,
  GBPUSD: 1.2741,
  USDJPY: 149.53,
  USDCHF: 0.9012,
  AUDUSD: 0.6534,
  USDCAD: 1.3621,
  XAUUSD: 2352.40,
  XAGUSD: 27.85,
  NAS100: 18547.0,
  US30: 39521.0,
  UK100: 8312.0,
  BTCUSD: 67245.0,
  ETHUSD: 3512.0,
};

const SYMBOLS: SymbolInfo[] = [
  { symbol: "EURUSD", description: "Euro / US Dollar", category: "forex", pipSize: 0.0001, displayDecimals: 5 },
  { symbol: "GBPUSD", description: "British Pound / US Dollar", category: "forex", pipSize: 0.0001, displayDecimals: 5 },
  { symbol: "USDJPY", description: "US Dollar / Japanese Yen", category: "forex", pipSize: 0.01, displayDecimals: 3 },
  { symbol: "USDCHF", description: "US Dollar / Swiss Franc", category: "forex", pipSize: 0.0001, displayDecimals: 5 },
  { symbol: "AUDUSD", description: "Australian Dollar / US Dollar", category: "forex", pipSize: 0.0001, displayDecimals: 5 },
  { symbol: "USDCAD", description: "US Dollar / Canadian Dollar", category: "forex", pipSize: 0.0001, displayDecimals: 5 },
  { symbol: "XAUUSD", description: "Gold / US Dollar", category: "commodities", pipSize: 0.01, displayDecimals: 2 },
  { symbol: "XAGUSD", description: "Silver / US Dollar", category: "commodities", pipSize: 0.001, displayDecimals: 3 },
  { symbol: "NAS100", description: "NASDAQ 100 Index", category: "indices", pipSize: 0.1, displayDecimals: 1 },
  { symbol: "US30", description: "Dow Jones 30 Index", category: "indices", pipSize: 1, displayDecimals: 1 },
  { symbol: "UK100", description: "FTSE 100 Index", category: "indices", pipSize: 0.1, displayDecimals: 1 },
  { symbol: "BTCUSD", description: "Bitcoin / US Dollar", category: "crypto", pipSize: 1, displayDecimals: 2 },
  { symbol: "ETHUSD", description: "Ethereum / US Dollar", category: "crypto", pipSize: 0.01, displayDecimals: 2 },
];

const TF_MINUTES: Record<Timeframe, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
};

/** Deterministic pseudo-random 0–1 from a seed number */
function dpr(seed: number): number {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

function generateMockCandles(symbol: string, timeframe: Timeframe, limit: number): CandleBar[] {
  const base = BASE_PRICES[symbol] ?? 1.0;
  const tfMs = TF_MINUTES[timeframe] * 60 * 1000;
  const nowMs = Date.now();
  const currentBarMs = Math.floor(nowMs / tfMs) * tfMs;

  const bars: CandleBar[] = [];
  let cumChange = 0;

  for (let i = limit; i >= 0; i--) {
    const barMs = currentBarMs - i * tfMs;
    const x = barMs / 1e9;

    // Smooth price walk using multiple sin waves — deterministic for the bar timestamp
    const delta =
      (Math.sin(x * 1.7 + base) * 0.3 +
        Math.sin(x * 7.31 + base) * 0.15 +
        Math.sin(x * 23.13 + base) * 0.05) *
      0.002;
    cumChange += delta;

    const price = base * (1 + cumChange);
    const isUp = Math.sin(x * 3.3 + base) > 0;
    const bodyHalf = price * 0.0004 * (dpr(x * 13.7 + base) + 0.3);
    const wick = price * 0.0006 * dpr(x * 5.1 + base);

    const open = price + (isUp ? -bodyHalf : bodyHalf);
    const close = price + (isUp ? bodyHalf : -bodyHalf);
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;
    const volume = Math.floor(dpr(x * 8.9 + base) * 1800 + 200);

    bars.push({
      time: Math.floor(barMs / 1000),
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return bars;
}

const MOCK_NEWS: NewsItem[] = [
  {
    id: "mock-1",
    headline: "Fed signals continued data-dependency on rate path",
    summary: "Federal Reserve officials reiterated their commitment to a data-driven approach ahead of next month's meeting.",
    source: "Demo Financial Wire",
    publishedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    symbols: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"],
    sentiment: "neutral",
  },
  {
    id: "mock-2",
    headline: "EUR/USD holds above 1.0850 ahead of ECB speakers",
    summary: "The euro consolidated gains with traders awaiting commentary from multiple ECB board members scheduled for today.",
    source: "Demo Financial Wire",
    publishedAt: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
    symbols: ["EURUSD"],
    sentiment: "bullish",
  },
  {
    id: "mock-3",
    headline: "Gold retreats from session highs as dollar firms",
    summary: "XAU/USD pulled back from intraday peaks after a stronger-than-expected jobs report boosted the US dollar index.",
    source: "Demo Financial Wire",
    publishedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    symbols: ["XAUUSD"],
    sentiment: "bearish",
  },
  {
    id: "mock-4",
    headline: "Bitcoin breaks above $67k resistance zone",
    summary: "BTC/USD cleared a key technical level as ETF inflows continued at elevated pace for a third consecutive session.",
    source: "Demo Financial Wire",
    publishedAt: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
    symbols: ["BTCUSD"],
    sentiment: "bullish",
  },
];

export class MockMarketDataProvider extends BaseMarketDataProvider {
  async getStatus(): Promise<ProviderStatus> {
    return {
      provider: "mock",
      mode: "demo",
      connected: true,
      label: "Demo Market Data",
    };
  }

  async getSymbols(): Promise<SymbolInfo[]> {
    return SYMBOLS;
  }

  async getQuote(symbol: string): Promise<QuoteData> {
    const base = BASE_PRICES[symbol];
    if (!base) throw new Error(`Unknown symbol: ${symbol}`);

    const x = Date.now() / 1e9;
    const drift = Math.sin(x * 1.7 + base) * 0.001 + Math.sin(x * 7.3 + base) * 0.0005;
    const mid = base * (1 + drift);
    const info = SYMBOLS.find((s) => s.symbol === symbol);
    const spread = (info?.pipSize ?? 0.0001) * 2;
    const bid = mid - spread / 2;
    const ask = mid + spread / 2;

    const prevDrift = Math.sin((x - 86400) * 1.7 + base) * 0.001;
    const prevClose = base * (1 + prevDrift);
    const change = mid - prevClose;
    const changePct = (change / prevClose) * 100;

    const highDrift = Math.sin(x * 2.1 + base) * 0.003;
    const lowDrift = Math.sin(x * 3.7 + base) * 0.003;
    const high24h = base * (1 + Math.abs(highDrift) + 0.001);
    const low24h = base * (1 - Math.abs(lowDrift) - 0.001);

    return {
      symbol,
      bid,
      ask,
      mid,
      change,
      changePct,
      high24h,
      low24h,
      timestamp: new Date().toISOString(),
    };
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 100): Promise<CandleData> {
    if (!BASE_PRICES[symbol]) throw new Error(`Unknown symbol: ${symbol}`);
    return {
      symbol,
      timeframe,
      bars: generateMockCandles(symbol, timeframe, limit),
    };
  }

  async getDom(symbol: string): Promise<DomData> {
    const base = BASE_PRICES[symbol];
    if (!base) throw new Error(`Unknown symbol: ${symbol}`);

    const info = SYMBOLS.find((s) => s.symbol === symbol);
    const pip = info?.pipSize ?? 0.0001;
    const x = Date.now() / 1e9;
    const mid = base * (1 + Math.sin(x * 1.7 + base) * 0.001);
    const spread = pip * 2;

    const bids = Array.from({ length: 10 }, (_, i) => ({
      price: mid - spread / 2 - i * pip,
      size: Math.floor(dpr((x + i) * 17.3 + base) * 2800 + 200),
    }));
    const asks = Array.from({ length: 10 }, (_, i) => ({
      price: mid + spread / 2 + i * pip,
      size: Math.floor(dpr((x + i) * 19.7 + base) * 2800 + 200),
    }));

    return { symbol, bids, asks, spread, timestamp: new Date().toISOString() };
  }

  async getHeatmap(symbol: string): Promise<HeatmapData> {
    const base = BASE_PRICES[symbol];
    if (!base) throw new Error(`Unknown symbol: ${symbol}`);

    const info = SYMBOLS.find((s) => s.symbol === symbol);
    const pip = info?.pipSize ?? 0.0001;
    const priceRange = pip * 50;
    const priceMin = base - priceRange;
    const priceMax = base + priceRange;
    const buckets = 12;
    const timeBuckets = 10;
    const nowSec = Math.floor(Date.now() / 1000);
    const cells = [];

    for (let pi = 0; pi < buckets; pi++) {
      for (let ti = 0; ti < timeBuckets; ti++) {
        const price = priceMin + (pi / buckets) * (priceMax - priceMin);
        const time = nowSec - (timeBuckets - ti) * 3600;
        const distFromCenter = Math.abs(pi - buckets / 2) / (buckets / 2);
        const volume = dpr(price * 1000 + ti * 7.3) * (1 - distFromCenter * 0.5);
        cells.push({ price, time, volume: Math.max(0, Math.min(1, volume)) });
      }
    }

    return { symbol, cells, priceMin, priceMax };
  }

  async getVolumeProfile(symbol: string): Promise<VolumeProfileData> {
    const base = BASE_PRICES[symbol];
    if (!base) throw new Error(`Unknown symbol: ${symbol}`);

    const info = SYMBOLS.find((s) => s.symbol === symbol);
    const pip = info?.pipSize ?? 0.0001;
    const priceRange = pip * 60;
    const levels = 20;
    const priceStep = (priceRange * 2) / levels;

    const bars = Array.from({ length: levels }, (_, i) => {
      const price = base - priceRange + i * priceStep;
      const distFromCenter = Math.abs(i - levels / 2) / (levels / 2);
      const rawVol = dpr(price * 1000) * (1 - distFromCenter * 0.6) + 0.1;
      return { price, volume: rawVol, isHighVolume: false };
    });

    const maxVol = Math.max(...bars.map((b) => b.volume));
    const pocBar = bars.find((b) => b.volume === maxVol)!;
    const threshold = maxVol * 0.7;
    bars.forEach((b) => { b.isHighVolume = b.volume >= threshold; });

    return { symbol, bars, pocPrice: pocBar.price };
  }

  async getNews(symbol?: string): Promise<NewsItem[]> {
    if (!symbol) return MOCK_NEWS;
    const filtered = MOCK_NEWS.filter((n) => n.symbols.includes(symbol));
    return filtered.length > 0 ? filtered : MOCK_NEWS.slice(0, 2);
  }
}
