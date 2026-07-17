import { afterEach, describe, expect, test, vi } from "vitest";
import { isTraderChartCaptureEnabled } from "@/lib/ai/chartCapture";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("trader chart capture feature flag", () => {
  test("honors an explicit enabled value", () => {
    vi.stubEnv("TRADER_CHART_AI_SCREENSHOTS_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect(isTraderChartCaptureEnabled()).toBe(true);
  });

  test("honors an explicit disabled value", () => {
    vi.stubEnv("TRADER_CHART_AI_SCREENSHOTS_ENABLED", "false");
    vi.stubEnv("NODE_ENV", "development");
    expect(isTraderChartCaptureEnabled()).toBe(false);
  });

  test("defaults on in every environment unless explicitly disabled", () => {
    vi.stubEnv("TRADER_CHART_AI_SCREENSHOTS_ENABLED", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isTraderChartCaptureEnabled()).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect(isTraderChartCaptureEnabled()).toBe(true);
  });
});
