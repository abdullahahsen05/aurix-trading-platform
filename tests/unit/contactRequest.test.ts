import { describe, expect, test } from "vitest";
import { contactRequestSchema } from "@/lib/validation/schemas";

describe("contact request validation", () => {
  test("accepts a complete mentorship request", () => {
    expect(contactRequestSchema.safeParse({
      name: "A Trader",
      email: "trader@example.com",
      subject: "Private mentorship",
      message: "I would like help improving my risk-management process.",
      type: "MENTORSHIP",
    }).success).toBe(true);
  });

  test("rejects invalid email and short messages", () => {
    expect(contactRequestSchema.safeParse({
      name: "A",
      email: "not-an-email",
      subject: "Hi",
      message: "Too short",
      type: "MENTORSHIP",
    }).success).toBe(false);
  });
});
