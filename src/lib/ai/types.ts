// ─────────────────────────────────────────────────────────────────────────────
// AI Assistant — shared server-side types & error codes
// ─────────────────────────────────────────────────────────────────────────────

export type AiRoute = "chat" | "chart-analysis";
export type AiFeature =
  | "ADMIN_ASSISTANT"
  | "ADMIN_IMAGE_ANALYSIS"
  | "TRADER_ASSISTANT"
  | "TRADER_CHART_ASSISTANT";

export type AiUsageStatus = "SUCCESS" | "FAILED";

/**
 * Stable error codes surfaced to the client via the standard envelope.
 * The UI maps these to friendly messages.
 */
export const AI_ERROR = {
  NOT_CONFIGURED: "AI_NOT_CONFIGURED",
  DISABLED: "AI_DISABLED",
  RATE_LIMITED: "AI_RATE_LIMITED",
  PROVIDER_ERROR: "AI_PROVIDER_ERROR",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  INVALID_IMAGE: "INVALID_IMAGE",
  ACCOUNT_NOT_FOUND: "ACCOUNT_NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  ECONOMIC_CALENDAR_ERROR: "ECONOMIC_CALENDAR_ERROR",
} as const;

export type AiErrorCode = (typeof AI_ERROR)[keyof typeof AI_ERROR];

/**
 * Typed AI error. Routes catch this and translate it to jsonFail(code, message, status),
 * exactly like AuthError. Never leaks raw provider stack traces.
 */
export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface GeminiResult {
  text: string;
  model: string;
  usage: TokenUsage;
}

export interface RateLimitState {
  limit: number;
  used: number;
  remaining: number;
  creditsRemaining?: number;
}
