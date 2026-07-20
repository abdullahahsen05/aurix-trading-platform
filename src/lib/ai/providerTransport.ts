import { GoogleGenAI } from "@google/genai";
import { AI_ERROR, AiError, type AiProvider, type AiResult, type TokenUsage } from "@/lib/ai/types";

const GEMINI_CHAT_MODEL = "gemini-2.5-flash";
const GEMINI_CHART_MODEL = "gemini-2.5-pro";
const OPENAI_CHAT_MODEL = "gpt-4.1-mini";
const OPENAI_CHART_MODEL = "gpt-4.1-mini";

export interface AiProviderRuntime {
  provider: AiProvider;
  apiKey: string;
  source: "DATABASE" | "ENVIRONMENT";
}

export interface ProviderValidationResult {
  valid: boolean;
  error: string | null;
}

export function providerModel(provider: AiProvider, purpose: "chat" | "chart"): string {
  if (provider === "OPENAI") {
    return purpose === "chart"
      ? process.env.OPENAI_CHART_MODEL?.trim() || OPENAI_CHART_MODEL
      : process.env.OPENAI_DEFAULT_MODEL?.trim() || OPENAI_CHAT_MODEL;
  }
  return purpose === "chart"
    ? process.env.AI_CHART_MODEL?.trim() || GEMINI_CHART_MODEL
    : process.env.AI_DEFAULT_MODEL?.trim() || GEMINI_CHAT_MODEL;
}

function buildUserText(contextJson: string | null, userText: string): string {
  if (!contextJson) return userText;
  return [
    "Authoritative WSA Global context for this request (use ONLY this data; do not invent values):",
    "```json",
    contextJson,
    "```",
    "",
    "User message:",
    userText,
  ].join("\n");
}

function geminiUsage(usageMetadata: unknown): TokenUsage {
  const usage = usageMetadata as
    | { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
    | undefined;
  return {
    promptTokens: usage?.promptTokenCount ?? null,
    completionTokens: usage?.candidatesTokenCount ?? null,
    totalTokens: usage?.totalTokenCount ?? null,
  };
}

function openAiUsage(usageMetadata: unknown): TokenUsage {
  const usage = usageMetadata as
    | { input_tokens?: number; output_tokens?: number; total_tokens?: number }
    | undefined;
  return {
    promptTokens: usage?.input_tokens ?? null,
    completionTokens: usage?.output_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
  };
}

function openAiOutputText(payload: unknown): string {
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  if (response.output_text?.trim()) return response.output_text.trim();
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("")
    .trim();
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number })?.status;
      if ((status !== 429 && status !== 503) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function openAiRequest(apiKey: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const error = new Error(`OpenAI request failed with HTTP ${response.status}.`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function providerGenerateText(params: {
  runtime: AiProviderRuntime;
  model: string;
  systemPrompt: string;
  userMessage: string;
  contextJson: string | null;
}): Promise<AiResult> {
  try {
    if (params.runtime.provider === "GEMINI") {
      const ai = new GoogleGenAI({ apiKey: params.runtime.apiKey });
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: params.model,
          contents: [{
            role: "user",
            parts: [{ text: buildUserText(params.contextJson, params.userMessage) }],
          }],
          config: {
            systemInstruction: params.systemPrompt,
            temperature: 0.4,
            maxOutputTokens: 1024,
          },
        }),
      );
      const text = response.text?.trim();
      if (!text) throw new Error("Provider returned an empty response.");
      return {
        text,
        model: params.model,
        provider: params.runtime.provider,
        usage: geminiUsage(response.usageMetadata),
      };
    }

    const response = await withRetry(() =>
      openAiRequest(params.runtime.apiKey, {
        model: params.model,
        instructions: params.systemPrompt,
        input: buildUserText(params.contextJson, params.userMessage),
        max_output_tokens: 1024,
      }),
    );
    const text = openAiOutputText(response);
    if (!text) throw new Error("Provider returned an empty response.");
    return {
      text,
      model: params.model,
      provider: params.runtime.provider,
      usage: openAiUsage((response as { usage?: unknown }).usage),
    };
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError(
      AI_ERROR.PROVIDER_ERROR,
      "We couldn't generate a response right now. Try again later.",
      502,
    );
  }
}

export async function providerAnalyzeImage(params: {
  runtime: AiProviderRuntime;
  model: string;
  systemPrompt: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  contextJson: string | null;
}): Promise<AiResult> {
  try {
    if (params.runtime.provider === "GEMINI") {
      const ai = new GoogleGenAI({ apiKey: params.runtime.apiKey });
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: params.model,
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
              { text: buildUserText(params.contextJson, params.prompt) },
            ],
          }],
          config: {
            systemInstruction: params.systemPrompt,
            temperature: 0.4,
            maxOutputTokens: 1536,
          },
        }),
      );
      const text = response.text?.trim();
      if (!text) throw new Error("Provider returned an empty response.");
      return {
        text,
        model: params.model,
        provider: params.runtime.provider,
        usage: geminiUsage(response.usageMetadata),
      };
    }

    const response = await withRetry(() =>
      openAiRequest(params.runtime.apiKey, {
        model: params.model,
        instructions: params.systemPrompt,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: buildUserText(params.contextJson, params.prompt) },
            {
              type: "input_image",
              image_url: `data:${params.mimeType};base64,${params.imageBase64}`,
              detail: "high",
            },
          ],
        }],
        max_output_tokens: 1536,
      }),
    );
    const text = openAiOutputText(response);
    if (!text) throw new Error("Provider returned an empty response.");
    return {
      text,
      model: params.model,
      provider: params.runtime.provider,
      usage: openAiUsage((response as { usage?: unknown }).usage),
    };
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError(
      AI_ERROR.PROVIDER_ERROR,
      "We couldn't analyze this chart right now. Try again later.",
      502,
    );
  }
}

export async function validateProviderKey(
  provider: AiProvider,
  apiKey: string,
): Promise<ProviderValidationResult> {
  try {
    const model = providerModel(provider, "chat");
    if (provider === "GEMINI") {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: "Reply with OK.",
        config: { maxOutputTokens: 8, temperature: 0 },
      });
      return response.text?.trim()
        ? { valid: true, error: null }
        : { valid: false, error: "Gemini returned an empty validation response." };
    }
    const response = await openAiRequest(apiKey, {
      model,
      input: "Reply with OK.",
      max_output_tokens: 8,
    });
    return openAiOutputText(response)
      ? { valid: true, error: null }
      : { valid: false, error: "OpenAI returned an empty validation response." };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) {
      return { valid: false, error: `Provider rejected the credential (HTTP ${status}).` };
    }
    if (status === 429) {
      return { valid: false, error: "Provider validation was rate-limited or has no available quota." };
    }
    return { valid: false, error: "Provider validation could not be completed." };
  }
}
