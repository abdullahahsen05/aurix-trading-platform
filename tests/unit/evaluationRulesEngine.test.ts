import { describe, expect, test } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 — Evaluation Rules Engine tests (pure unit, no DB).
// Mirror the logic in evaluationRulesEngine.ts to test in isolation.
// ─────────────────────────────────────────────────────────────────────────────

interface Rules {
  profitTargetPercent: number;
  maxDailyDrawdownPercent: number;
  maxOverallDrawdownPercent: number;
  minimumTradingDays: number;
  durationDays: number;
  startingBalance: number;
}

interface Metrics {
  startingBalance: number;
  currentBalance: number;
  profitPercent: number;
  maxDrawdownPercent: number;
  maxDailyDrawdownPercent: number;
  tradingDays: number;
  elapsedDays: number;
  daysRemaining: number;
}

type CheckResult = "NO_CHANGE" | "PASSED" | "FAILED" | "EXPIRED" | "NEEDS_REVIEW";

function determineResult(
  metrics: Metrics,
  rules: Rules,
  isExpired: boolean,
  isActive: boolean,
): { result: CheckResult; reason: string | null } {
  if (!isActive) return { result: "NO_CHANGE", reason: null };
  if (isExpired) return { result: "EXPIRED", reason: "Evaluation period has ended without meeting all pass conditions" };

  // Fail conditions (breach = immediate fail)
  if (metrics.maxDailyDrawdownPercent > rules.maxDailyDrawdownPercent) {
    return {
      result: "FAILED",
      reason: `Daily drawdown limit breached: ${metrics.maxDailyDrawdownPercent.toFixed(2)}% exceeds ${rules.maxDailyDrawdownPercent}%`,
    };
  }
  if (metrics.maxDrawdownPercent > rules.maxOverallDrawdownPercent) {
    return {
      result: "FAILED",
      reason: `Overall drawdown limit breached: ${metrics.maxDrawdownPercent.toFixed(2)}% exceeds ${rules.maxOverallDrawdownPercent}%`,
    };
  }

  // Pass conditions (all must be met simultaneously)
  const profitMet = metrics.profitPercent >= rules.profitTargetPercent;
  const tradingDaysMet = metrics.tradingDays >= rules.minimumTradingDays;
  if (profitMet && tradingDaysMet) {
    return {
      result: "PASSED",
      reason: `Profit target of ${rules.profitTargetPercent}% reached with ${metrics.tradingDays} trading days`,
    };
  }

  return { result: "NO_CHANGE", reason: null };
}

function countTradingDays(closedDates: string[], startedAt: string): number {
  const startMs = new Date(startedAt).getTime();
  const days = new Set<string>();
  for (const d of closedDates) {
    const dt = new Date(d);
    if (dt.getTime() >= startMs) days.add(dt.toISOString().slice(0, 10));
  }
  return days.size;
}

const BASE_RULES: Rules = {
  profitTargetPercent: 8,
  maxDailyDrawdownPercent: 5,
  maxOverallDrawdownPercent: 10,
  minimumTradingDays: 5,
  durationDays: 30,
  startingBalance: 10_000,
};

function makeMetrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    startingBalance: 10_000,
    currentBalance: 10_000,
    profitPercent: 0,
    maxDrawdownPercent: 0,
    maxDailyDrawdownPercent: 0,
    tradingDays: 0,
    elapsedDays: 5,
    daysRemaining: 25,
    ...overrides,
  };
}

// ─── Rules engine ────────────────────────────────────────────────────────────

describe("determineResult", () => {
  test("inactive attempt returns NO_CHANGE", () => {
    const { result } = determineResult(makeMetrics(), BASE_RULES, false, false);
    expect(result).toBe("NO_CHANGE");
  });

  test("expired returns EXPIRED even if profit met", () => {
    const m = makeMetrics({ profitPercent: 10, tradingDays: 8, daysRemaining: 0 });
    const { result } = determineResult(m, BASE_RULES, true, true);
    expect(result).toBe("EXPIRED");
  });

  test("daily drawdown breach returns FAILED", () => {
    const m = makeMetrics({ maxDailyDrawdownPercent: 6 });
    const { result, reason } = determineResult(m, BASE_RULES, false, true);
    expect(result).toBe("FAILED");
    expect(reason).toContain("Daily drawdown limit breached");
  });

  test("overall drawdown breach returns FAILED", () => {
    const m = makeMetrics({ maxDrawdownPercent: 11 });
    const { result, reason } = determineResult(m, BASE_RULES, false, true);
    expect(result).toBe("FAILED");
    expect(reason).toContain("Overall drawdown limit breached");
  });

  test("profit met but not enough trading days returns NO_CHANGE", () => {
    const m = makeMetrics({ profitPercent: 9, tradingDays: 3 });
    const { result } = determineResult(m, BASE_RULES, false, true);
    expect(result).toBe("NO_CHANGE");
  });

  test("trading days met but profit not met returns NO_CHANGE", () => {
    const m = makeMetrics({ profitPercent: 5, tradingDays: 8 });
    const { result } = determineResult(m, BASE_RULES, false, true);
    expect(result).toBe("NO_CHANGE");
  });

  test("profit target reached with min trading days returns PASSED", () => {
    const m = makeMetrics({ profitPercent: 8, tradingDays: 5 });
    const { result, reason } = determineResult(m, BASE_RULES, false, true);
    expect(result).toBe("PASSED");
    expect(reason).toContain("Profit target of 8%");
  });

  test("profit above target with more trading days returns PASSED", () => {
    const m = makeMetrics({ profitPercent: 12, tradingDays: 10 });
    const { result } = determineResult(m, BASE_RULES, false, true);
    expect(result).toBe("PASSED");
  });

  test("drawdown check happens before pass check", () => {
    // Both profit met AND drawdown breached — fail wins
    const m = makeMetrics({ profitPercent: 10, tradingDays: 6, maxDailyDrawdownPercent: 6 });
    const { result } = determineResult(m, BASE_RULES, false, true);
    expect(result).toBe("FAILED");
  });

  test("exactly at profit target percentage passes", () => {
    const m = makeMetrics({ profitPercent: 8.0, tradingDays: 5 });
    const { result } = determineResult(m, BASE_RULES, false, true);
    expect(result).toBe("PASSED");
  });

  test("exactly at drawdown limit does not fail (strictly greater fails)", () => {
    const m = makeMetrics({ maxDailyDrawdownPercent: 5.0 });
    const { result } = determineResult(m, BASE_RULES, false, true);
    expect(result).toBe("NO_CHANGE");
  });
});

// ─── Trading days counter ─────────────────────────────────────────────────────

describe("countTradingDays", () => {
  const start = "2026-01-01T00:00:00Z";

  test("counts distinct days from closed trades", () => {
    const dates = [
      "2026-01-02T10:00:00Z",
      "2026-01-02T14:00:00Z", // same day — should count once
      "2026-01-03T09:00:00Z",
      "2026-01-05T11:00:00Z",
    ];
    expect(countTradingDays(dates, start)).toBe(3);
  });

  test("ignores trades before attempt started", () => {
    const dates = [
      "2025-12-31T23:59:00Z", // before start
      "2026-01-02T10:00:00Z",
    ];
    expect(countTradingDays(dates, start)).toBe(1);
  });

  test("returns 0 for empty list", () => {
    expect(countTradingDays([], start)).toBe(0);
  });

  test("counts trades on the start boundary correctly", () => {
    const dates = ["2026-01-01T00:00:00Z"]; // exactly at start
    expect(countTradingDays(dates, start)).toBe(1);
  });
});

// ─── Academy unlock ───────────────────────────────────────────────────────────

describe("academy unlock logic", () => {
  function canStart(progressPercent: number, requiredCourseId: string | null): { canStart: boolean; reason?: string } {
    if (requiredCourseId === null) return { canStart: true };
    if (progressPercent < 100) return { canStart: false, reason: "ACADEMY_NOT_COMPLETED" };
    return { canStart: true };
  }

  test("locked when required course incomplete", () => {
    const { canStart: ok, reason } = canStart(75, "course-uuid");
    expect(ok).toBe(false);
    expect(reason).toBe("ACADEMY_NOT_COMPLETED");
  });

  test("unlocked when 100% complete", () => {
    const { canStart: ok } = canStart(100, "course-uuid");
    expect(ok).toBe(true);
  });

  test("program without required course is always unlocked", () => {
    const { canStart: ok } = canStart(0, null);
    expect(ok).toBe(true);
  });

  test("99% complete is still locked", () => {
    const { canStart: ok } = canStart(99, "course-uuid");
    expect(ok).toBe(false);
  });
});

// ─── Certificate verification ID ─────────────────────────────────────────────

describe("verification ID", () => {
  function generateVerificationId(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let id = "AX-";
    // Use deterministic pattern for test
    for (let i = 0; i < 8; i++) {
      id += chars[i % chars.length];
    }
    return id;
  }

  test("starts with AX-", () => {
    const id = generateVerificationId();
    expect(id.startsWith("AX-")).toBe(true);
  });

  test("is 11 characters total", () => {
    const id = generateVerificationId();
    expect(id.length).toBe(11);
  });

  test("contains only allowed charset after prefix", () => {
    const id = generateVerificationId();
    const body = id.slice(3);
    expect(/^[A-HJ-NP-Z2-9]+$/.test(body)).toBe(true);
  });
});

// ─── RBAC guard logic ─────────────────────────────────────────────────────────

describe("RBAC guards", () => {
  type Role = "ADMIN" | "TRADER" | "PARTNER";

  function canAccessAdminRoute(role: Role): boolean {
    return role === "ADMIN";
  }

  function canAccessOwnAttempt(requestUserId: string, attemptUserId: string): boolean {
    return requestUserId === attemptUserId;
  }

  test("admin can access admin routes", () => {
    expect(canAccessAdminRoute("ADMIN")).toBe(true);
  });

  test("trader cannot access admin routes", () => {
    expect(canAccessAdminRoute("TRADER")).toBe(false);
  });

  test("partner cannot access admin routes", () => {
    expect(canAccessAdminRoute("PARTNER")).toBe(false);
  });

  test("trader can access own attempt", () => {
    expect(canAccessOwnAttempt("user-1", "user-1")).toBe(true);
  });

  test("trader cannot access another trader's attempt", () => {
    expect(canAccessOwnAttempt("user-1", "user-2")).toBe(false);
  });
});

// ─── Certificate issuance guard ───────────────────────────────────────────────

describe("certificate issuance guard", () => {
  function canIssueCertificate(attemptStatus: string): { allowed: boolean; reason?: string } {
    if (attemptStatus !== "PASSED") return { allowed: false, reason: "EVALUATION_NOT_PASSED" };
    return { allowed: true };
  }

  test("cannot issue for non-passed attempt", () => {
    for (const s of ["PENDING", "ACTIVE", "FAILED", "EXPIRED", "CANCELLED", "NEEDS_REVIEW"]) {
      const { allowed } = canIssueCertificate(s);
      expect(allowed).toBe(false);
    }
  });

  test("can issue for PASSED attempt", () => {
    const { allowed } = canIssueCertificate("PASSED");
    expect(allowed).toBe(true);
  });
});
