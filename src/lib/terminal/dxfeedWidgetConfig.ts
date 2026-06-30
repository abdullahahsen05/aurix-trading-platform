/**
 * dxFeed Candelabra Widget Configuration — SERVER ONLY
 *
 * Checks all required env vars for the dxFeed Candelabra white-label widget suite.
 * Never import from client components — this file reads secret env vars.
 *
 * Data flow:
 *   Browser → /api/dxfeed/ipf      → dxFeed IPF   (auth injected server-side)
 *   Browser → /api/dxfeed/schedule → dxFeed Schedule
 *   Browser → /api/dxfeed/scanner  → dxFeed Scanner (auth injected server-side)
 *   Browser → /api/dxfeed/news     → dxFeed News   (auth injected server-side)
 *   Browser → wss://...?token=<t>  → dxFeed Feed   (short-lived token via /api/dxfeed/feed-token)
 *
 * References: https://widgets.dxfeed.com/docs/widgets/
 */

export interface DxfeedWidgetEnvStatus {
  configured: boolean;
  cdnUrl: string | null;
  missing: string[];
  checks: Record<string, boolean>;
}

const REQUIRED = [
  "DXFEED_WIDGET_CDN_URL",
  "DXFEED_IPF_PATH",
  "DXFEED_IPF_AUTH_HEADER",
  "DXFEED_FEED_PATH",
  "DXFEED_FEED_AUTH_HEADER",
  "DXFEED_SCANNER_PATH",
  "DXFEED_SCANNER_AUTH_HEADER",
  "DXFEED_NEWS_PATH",
  "DXFEED_NEWS_AUTH_HEADER",
  "DXFEED_SCHEDULE_PATH",
] as const;

export function getDxfeedWidgetEnvStatus(): DxfeedWidgetEnvStatus {
  const checks: Record<string, boolean> = {};
  const missing: string[] = [];

  for (const key of REQUIRED) {
    const present = Boolean(process.env[key]);
    checks[key] = present;
    if (!present) missing.push(key);
  }

  return {
    configured: missing.length === 0,
    cdnUrl: process.env.DXFEED_WIDGET_CDN_URL ?? null,
    missing,
    checks,
  };
}

export function isWidgetConfigured(): boolean {
  return getDxfeedWidgetEnvStatus().configured;
}

/** Server-side auth headers — never send these values to the browser directly. */
export function getServerAuthHeaders() {
  return {
    ipf: process.env.DXFEED_IPF_AUTH_HEADER ?? "",
    feed: process.env.DXFEED_FEED_AUTH_HEADER ?? "",
    scanner: process.env.DXFEED_SCANNER_AUTH_HEADER ?? "",
    news: process.env.DXFEED_NEWS_AUTH_HEADER ?? "",
  };
}

/** Upstream endpoint URLs (safe to log — no credentials). */
export function getUpstreamPaths() {
  return {
    ipf: process.env.DXFEED_IPF_PATH ?? "",
    feed: process.env.DXFEED_FEED_PATH ?? "",
    scanner: process.env.DXFEED_SCANNER_PATH ?? "",
    news: process.env.DXFEED_NEWS_PATH ?? "",
    schedule: process.env.DXFEED_SCHEDULE_PATH ?? "",
    tokenExchange: process.env.DXFEED_TOKEN_EXCHANGE_URL ?? "",
  };
}
