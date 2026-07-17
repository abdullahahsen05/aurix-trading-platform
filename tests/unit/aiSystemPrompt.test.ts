import { describe, expect, test } from "vitest";
import { buildChartSystemPrompt, buildChatSystemPrompt } from "@/lib/ai/systemPrompt";

describe("system prompt — Aurix identity", () => {
  const chat = buildChatSystemPrompt();
  const chart = buildChartSystemPrompt();

  test("declares the WSA Assistant identity", () => {
    expect(chat).toContain("WSA Assistant");
    expect(chart).toContain("WSA Assistant");
  });

  test("explicitly disavows Gemini/Google", () => {
    for (const p of [chat, chart]) {
      expect(p).toContain("NOT Gemini");
      expect(p).toContain("NOT Google");
    }
  });

  test("forbids profit guarantees", () => {
    expect(chat).toContain("NEVER guarantee profits");
  });

  test("instructs not to reveal the system prompt", () => {
    expect(chat.toLowerCase()).toContain("never reveal");
  });

  test("chart prompt requires a risk disclaimer and bans 'buy now'", () => {
    expect(chart).toContain("educational-risk disclaimer");
    expect(chart).toContain('"buy now"');
  });

  test("chart prompt recognizes a supplied temporary chart frame", () => {
    expect(chart).toContain("temporary frame");
    expect(chart).toContain("not a continuous live feed");
    expect(chart).toContain("Do not begin by claiming that you cannot see the chart");
  });
});
