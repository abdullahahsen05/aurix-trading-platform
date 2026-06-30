export type ProviderName = "mock" | "dxfeed";
export type ProviderMode = "demo" | "live";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface ProviderStatus {
  provider: ProviderName;
  mode: ProviderMode;
  connected: boolean;
  /** Shown in the UI — "Demo Market Data" or "Live Market Data" */
  label: string;
  error?: string;
}

export interface SymbolInfo {
  symbol: string;
  description: string;
  category: "forex" | "commodities" | "indices" | "crypto";
  pipSize: number;
  displayDecimals: number;
}

export interface QuoteData {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  change: number;
  changePct: number;
  high24h: number;
  low24h: number;
  timestamp: string;
}

export interface CandleBar {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CandleData {
  symbol: string;
  timeframe: Timeframe;
  bars: CandleBar[];
}

export interface DomLevel {
  price: number;
  size: number;
}

export interface DomData {
  symbol: string;
  bids: DomLevel[];
  asks: DomLevel[];
  spread: number;
  timestamp: string;
}

export interface HeatmapCell {
  price: number;
  time: number; // Unix seconds
  volume: number; // 0–1 normalised
}

export interface HeatmapData {
  symbol: string;
  cells: HeatmapCell[];
  priceMin: number;
  priceMax: number;
}

export interface VolumeProfileBar {
  price: number;
  volume: number;
  isHighVolume: boolean;
}

export interface VolumeProfileData {
  symbol: string;
  bars: VolumeProfileBar[];
  pocPrice: number; // Point of Control
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  publishedAt: string;
  symbols: string[];
  sentiment: "bullish" | "bearish" | "neutral";
}

export interface MacroEvent {
  id: string;
  title: string;
  currency: string;
  impact: "LOW" | "MEDIUM" | "HIGH";
  eventTime: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

export interface TerminalPreferences {
  symbol: string;
  timeframe: Timeframe;
  layout: Record<string, unknown>;
}

export interface ProviderSettings {
  provider: ProviderName;
  isEnabled: boolean;
  demoMode: boolean;
  notes: string | null;
  updatedAt: string;
}
