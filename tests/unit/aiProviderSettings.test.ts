import { describe, expect, it } from "vitest";
import { aiProviderKeySchema, aiProviderSchema } from "@/lib/ai/providerValidation";
import { maskAiApiKey } from "@/lib/services/aiProviderService";

describe("AI provider settings", () => {
  it("supports only Gemini and OpenAI", () => {
    expect(aiProviderSchema.safeParse("GEMINI").success).toBe(true);
    expect(aiProviderSchema.safeParse("OPENAI").success).toBe(true);
    expect(aiProviderSchema.safeParse("OTHER").success).toBe(false);
  });

  it("never exposes a full saved key in the hint", () => {
    const key = "sk-example-secret-value-abcd";
    const hint = maskAiApiKey(key);
    expect(hint).toBe("sk-e••••abcd");
    expect(hint).not.toContain("secret");
    expect(hint).not.toBe(key);
  });

  it("rejects empty and implausibly short credentials", () => {
    expect(aiProviderKeySchema.safeParse({ provider: "GEMINI", apiKey: "" }).success).toBe(false);
    expect(aiProviderKeySchema.safeParse({ provider: "OPENAI", apiKey: "short" }).success).toBe(false);
  });
});
