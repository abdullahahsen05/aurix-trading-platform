import { describe, expect, test } from "vitest";
import {
  getAnalyticsPeriodStart,
  mapScopedEquityCurve,
} from "@/lib/services/analyticsService";

describe("analytics account aggregation", () => {
  test("sums the latest daily snapshot from each scoped account", () => {
    const curve = mapScopedEquityCurve(
      [
        { trading_account_id: "a1", balance: 110, equity: 112, captured_at: "2026-07-15T12:00:00.000Z" },
        { trading_account_id: "a2", balance: 210, equity: 208, captured_at: "2026-07-15T11:00:00.000Z" },
        { trading_account_id: "a1", balance: 100, equity: 101, captured_at: "2026-07-15T08:00:00.000Z" },
        { trading_account_id: "a1", balance: 90, equity: 92, captured_at: "2026-07-14T12:00:00.000Z" },
      ],
      true,
    );

    expect(curve).toEqual([
      { capturedAt: "2026-07-14T23:59:59.999Z", balance: 90, equity: 92 },
      { capturedAt: "2026-07-15T23:59:59.999Z", balance: 320, equity: 320 },
    ]);
  });

  test("preserves chronological snapshots for an individual account", () => {
    const curve = mapScopedEquityCurve(
      [
        { trading_account_id: "a1", balance: 110, equity: 112, captured_at: "2026-07-15T12:00:00.000Z" },
        { trading_account_id: "a1", balance: 100, equity: 101, captured_at: "2026-07-15T08:00:00.000Z" },
      ],
      false,
    );
    expect(curve.map((point) => point.equity)).toEqual([101, 112]);
  });

  test("uses UTC boundaries for daily and monthly periods", () => {
    const now = new Date("2026-07-15T20:30:00.000Z");
    expect(getAnalyticsPeriodStart("DAILY", now)?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(getAnalyticsPeriodStart("MONTHLY", now)?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(getAnalyticsPeriodStart("ALL_TIME", now)).toBeNull();
  });
});
