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

export abstract class BaseMarketDataProvider {
  abstract getStatus(): Promise<ProviderStatus>;
  abstract getSymbols(): Promise<SymbolInfo[]>;
  abstract getQuote(symbol: string): Promise<QuoteData>;
  abstract getCandles(symbol: string, timeframe: Timeframe, limit?: number): Promise<CandleData>;
  abstract getDom(symbol: string): Promise<DomData>;
  abstract getHeatmap(symbol: string): Promise<HeatmapData>;
  abstract getVolumeProfile(symbol: string): Promise<VolumeProfileData>;
  abstract getNews(symbol?: string): Promise<NewsItem[]>;
}
