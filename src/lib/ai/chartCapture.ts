const TRADER_CHART_CAPTURE_ENV = "TRADER_CHART_AI_SCREENSHOTS_ENABLED";

/**
 * Chart review is a core assistant feature. It is enabled by default and can
 * still be explicitly disabled for a deployment.
 */
export function isTraderChartCaptureEnabled(): boolean {
  const configured = process.env[TRADER_CHART_CAPTURE_ENV]?.trim().toLowerCase();
  if (configured) return configured === "true";
  return true;
}
