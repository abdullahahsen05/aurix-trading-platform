import { GoogleGenAI } from "@google/genai";
import { AI_ERROR, AiError, type GeminiResult, type TokenUsage } from "@/lib/ai/types";

// ─────────────────────────────────────────────────────────────────────────────
// AI Assistant — Gemini client (server-only)
//
// All Gemini SDK usage is isolated here. The API key is read from the server
// environment and is NEVER exposed to the browser. Model IDs are environment
// driven; the constants below are safe, currently-supported defaults used only
// when the corresponding env var is unset.
// ─────────────────────────────────────────────────────────────────────────────

// Currently-supported GA models (verified against @google/genai v2.x).
// Override via AI_DEFAULT_MODEL / AI_CHART_MODEL without code changes.
const DEFAULT_CHAT_MODEL = "gemini-2.5-flash";
const DEFAULT_CHART_MODEL = "gemini-2.5-pro";

export function chatModel(): string {
  return process.env.AI_DEFAULT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

export function chartModel(): string {
  return process.env.AI_CHART_MODEL?.trim() || DEFAULT_CHART_MODEL;
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AiError(
      AI_ERROR.NOT_CONFIGURED,
      "AI is not configured yet.",
      503,
    );
  }
  return new GoogleGenAI({ apiKey });
}

function extractUsage(usageMetadata: unknown): TokenUsage {
  const u = usageMetadata as
    | { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
    | undefined;
  return {
    promptTokens: u?.promptTokenCount ?? null,
    completionTokens: u?.candidatesTokenCount ?? null,
    totalTokens: u?.totalTokenCount ?? null,
  };
}

/**
 * Retry transient provider errors (503 UNAVAILABLE / 429 rate-limited) with a
 * short backoff. Non-transient errors (auth, invalid request) are thrown
 * immediately. This keeps brief free-tier spikes from reaching the user.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const retryable = status === 503 || status === 429;
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw lastErr;
}

function buildUserText(contextJson: string | null, userText: string): string {
  if (!contextJson) return userText;
  return [
    "Authoritative Aurix context for this request (use ONLY this data; do not invent values):",
    "```json",
    contextJson,
    "```",
    "",
    "User message:",
    userText,
  ].join("\n");
}

/**
 * Generate a text chat response. Throws AiError on missing key / provider failure.
 */
export async function generateText(params: {
  model: string;
  systemPrompt: string;
  userMessage: string;
  contextJson: string | null;
}): Promise<GeminiResult> {
  const ai = getClient();
  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: params.model,
        contents: [
          { role: "user", parts: [{ text: buildUserText(params.contextJson, params.userMessage) }] },
        ],
        config: {
          systemInstruction: params.systemPrompt,
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      }),
    );

    const text = response.text?.trim();
    if (!text) {
      throw new AiError(AI_ERROR.PROVIDER_ERROR, "The assistant returned an empty response.", 502);
    }
    return { text, model: params.model, usage: extractUsage(response.usageMetadata) };
  } catch (err) {
    if (err instanceof AiError) throw err;
    console.error("[geminiClient] generateText failed:", err);
    throw new AiError(AI_ERROR.PROVIDER_ERROR, "We couldn't generate a response right now. Try again later.", 502);
  }
}

/**
 * Analyze a chart screenshot (multimodal). Throws AiError on missing key / provider failure.
 */
export async function analyzeImage(params: {
  model: string;
  systemPrompt: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  contextJson: string | null;
}): Promise<GeminiResult> {
  const ai = getClient();
  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: params.model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
              { text: buildUserText(params.contextJson, params.prompt) },
            ],
          },
        ],
        config: {
          systemInstruction: params.systemPrompt,
          temperature: 0.4,
          maxOutputTokens: 1536,
        },
      }),
    );

    const text = response.text?.trim();
    if (!text) {
      throw new AiError(AI_ERROR.PROVIDER_ERROR, "The assistant returned an empty analysis.", 502);
    }
    return { text, model: params.model, usage: extractUsage(response.usageMetadata) };
  } catch (err) {
    if (err instanceof AiError) throw err;
    console.error("[geminiClient] analyzeImage failed:", err);
    throw new AiError(AI_ERROR.PROVIDER_ERROR, "We couldn't analyze this chart right now. Try again later.", 502);
  }
}
