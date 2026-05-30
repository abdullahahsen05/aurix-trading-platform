export type UserRole = "TRADER" | "ADMIN";
export type AccountStatus =
  | "PENDING"
  | "CONNECTED"
  | "SYNCING"
  | "DISCONNECTED"
  | "RESTRICTED";
export type TradeStatus = "OPEN" | "CLOSED";
export type TradeSide = "BUY" | "SELL";
export type RiskSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface MoneyValue {
  amount: number;
  currency: string;
}

export interface TraderAccountSummary {
  accountId: string;
  accountName: string;
  brokerName: string;
  status: AccountStatus;
  balance: MoneyValue;
  equity: MoneyValue;
  floatingPnl: MoneyValue;
  openTradeCount: number;
  drawdownPercent: number;
  updatedAt: string;
}

export interface TradeDto {
  id: string;
  accountId: string;
  symbol: string;
  side: TradeSide;
  status: TradeStatus;
  volume: number;
  openPrice: number;
  closePrice: number | null;
  profit: MoneyValue;
  openedAt: string;
  closedAt: string | null;
}

export interface AnalyticsSummary {
  accountId: string;
  totalProfit: MoneyValue;
  winRatePercent: number;
  maxDrawdownPercent: number;
  riskRewardRatio: number;
  consistencyScore: number;
  tradeCount: number;
  period: "DAILY" | "WEEKLY" | "MONTHLY" | "ALL_TIME";
}

export interface EquityPoint {
  capturedAt: string;
  balance: number;
  equity: number;
}

export interface RiskRuleDto {
  id: string;
  scope: "PLATFORM" | "ACCOUNT";
  name: string;
  severity: RiskSeverity;
  metric: "DAILY_LOSS" | "MAX_DRAWDOWN" | "OPEN_TRADES";
  threshold: number;
  enabled: boolean;
}

export interface RiskEventDto {
  id: string;
  accountId: string;
  ruleName: string;
  severity: RiskSeverity;
  message: string;
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  accountId: string | null;
  type: string | null;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface CrmNoteDto {
  id: string;
  traderId: string;
  authorName: string;
  note: string;
  createdAt: string;
}

export interface TraderProfileDto {
  traderId: string;
  name: string;
  email: string;
  segment: "EVALUATION" | "FUNDED" | "AT_RISK" | "VIP";
  accountCount: number;
  totalEquity: MoneyValue;
  lastActivityAt: string;
}

export interface AdminSummaryDto {
  activeTraders: number;
  connectedAccounts: number;
  openRiskEvents: number;
  monthlyRecurringRevenue: MoneyValue;
}

export type SubscriptionStatus = "ACTIVE" | "PAUSED" | "TRIAL" | "CANCELLED";

export interface SubscriptionDto {
  id: string;
  traderProfileId: string;
  traderName: string;
  traderEmail: string;
  planName: string;
  status: SubscriptionStatus;
  startedAt: string;
  endsAt: string | null;
  createdAt: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;
