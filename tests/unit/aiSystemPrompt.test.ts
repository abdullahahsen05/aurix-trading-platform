import { describe, expect, test } from "vitest";
import { buildChartSystemPrompt, buildChatSystemPrompt } from "@/lib/ai/systemPrompt";

describe("system prompt — Aurix identity", () => {
  const chat = buildChatSystemPrompt();
  const chart = buildChartSystemPrompt();

  test("declares the Aurix identity", () => {
    expect(chat).toContain("Aurix AI Trading Assistant");
    expect(chart).toContain("Aurix AI Trading Assistant");
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
});
