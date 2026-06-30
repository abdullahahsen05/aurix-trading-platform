import { describe, expect, test } from "vitest";
import { backoffMs } from "@/lib/services/backgroundJobService";

describe("backoffMs", () => {
  test("1m → 5m → 15m schedule by attempt", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(300_000);
    expect(backoffMs(3)).toBe(900_000);
  });

  test("clamps below 1 and above the schedule", () => {
    expect(backoffMs(0)).toBe(60_000);
    expect(backoffMs(99)).toBe(900_000);
  });
});
