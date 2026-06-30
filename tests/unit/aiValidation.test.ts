import { describe, expect, test } from "vitest";
import {
  aiChatSchema,
  aiUserLimitsUpdateSchema,
  economicEventCreateSchema,
} from "@/lib/validation/schemas";

describe("aiChatSchema", () => {
  test("accepts a valid message", () => {
    expect(aiChatSchema.safeParse({ message: "How is my risk?" }).success).toBe(true);
  });

  test("rejects empty messages", () => {
    expect(aiChatSchema.safeParse({ message: "   " }).success).toBe(false);
  });

  test("rejects messages over 4000 chars", () => {
    expect(aiChatSchema.safeParse({ message: "x".repeat(4001) }).success).toBe(false);
  });

  test("rejects a non-uuid accountId", () => {
    expect(aiChatSchema.safeParse({ message: "hi", accountId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("economicEventCreateSchema", () => {
  const base = {
    title: "US CPI",
    currency: "USD",
    impact: "HIGH" as const,
    eventTime: "2026-06-20T12:30:00.000Z",
  };

  test("accepts a valid event", () => {
    expect(economicEventCreateSchema.safeParse(base).success).toBe(true);
  });

  test("rejects an invalid impact", () => {
    expect(economicEventCreateSchema.safeParse({ ...base, impact: "EXTREME" }).success).toBe(false);
  });

  test("rejects a non-ISO event time", () => {
    expect(economicEventCreateSchema.safeParse({ ...base, eventTime: "June 20" }).success).toBe(false);
  });
});

describe("aiUserLimitsUpdateSchema", () => {
  test("accepts a single field update", () => {
    expect(aiUserLimitsUpdateSchema.safeParse({ aiEnabled: false }).success).toBe(true);
  });

  test("allows null to clear a limit (revert to default)", () => {
    expect(aiUserLimitsUpdateSchema.safeParse({ chatDailyLimit: null }).success).toBe(true);
  });

  test("rejects an empty patch", () => {
    expect(aiUserLimitsUpdateSchema.safeParse({}).success).toBe(false);
  });

  test("rejects negative limits", () => {
    expect(aiUserLimitsUpdateSchema.safeParse({ chatDailyLimit: -5 }).success).toBe(false);
  });
});
