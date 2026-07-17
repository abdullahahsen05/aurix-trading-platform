import { describe, expect, test } from "vitest";
import {
  canUseAdminAssistant,
  canUseGenericImageAnalysis,
  canUseTraderChartAssistant,
} from "@/lib/ai/access";
import { traderChartAssistantSchema } from "@/lib/validation/schemas";

describe("AI feature access", () => {
  test("generic image analysis is limited to both admin roles", () => {
    expect(canUseGenericImageAnalysis("ADMIN")).toBe(true);
    expect(canUseGenericImageAnalysis("SUPER_ADMIN")).toBe(true);
    expect(canUseGenericImageAnalysis("TRADER")).toBe(false);
    expect(canUseGenericImageAnalysis("PARTNER")).toBe(false);
  });

  test("controlled chart assistance is trader-only", () => {
    expect(canUseTraderChartAssistant("TRADER")).toBe(true);
    expect(canUseTraderChartAssistant("ADMIN")).toBe(false);
    expect(canUseTraderChartAssistant("SUPER_ADMIN")).toBe(false);
    expect(canUseTraderChartAssistant("PARTNER")).toBe(false);
  });

  test("admin assistant supports Admin and Super Admin", () => {
    expect(canUseAdminAssistant("ADMIN")).toBe(true);
    expect(canUseAdminAssistant("SUPER_ADMIN")).toBe(true);
    expect(canUseAdminAssistant("TRADER")).toBe(false);
  });

  test("chart context accepts metadata but no image field", () => {
    const result = traderChartAssistantSchema.parse({
      message: "What risk checks should I make?",
      symbol: "XAUUSD",
      timeframe: "15m",
      image: "not accepted",
    });
    expect(result).toEqual({
      message: "What risk checks should I make?",
      symbol: "XAUUSD",
      timeframe: "15m",
    });
    expect("image" in result).toBe(false);
  });
});
