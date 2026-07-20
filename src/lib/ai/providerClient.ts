import { AI_ERROR, AiError, type AiResult } from "@/lib/ai/types";
import {
  providerAnalyzeImage,
  providerGenerateText,
  providerModel,
} from "@/lib/ai/providerTransport";
import { resolveAiProvider } from "@/lib/services/aiProviderService";

async function runtime(purpose: "chat" | "chart") {
  try {
    const provider = await resolveAiProvider();
    return { ...provider, model: providerModel(provider.provider, purpose) };
  } catch {
    throw new AiError(AI_ERROR.NOT_CONFIGURED, "AI is not configured yet.", 503);
  }
}

export async function generateText(params: {
  systemPrompt: string;
  userMessage: string;
  contextJson: string | null;
}): Promise<AiResult> {
  const resolved = await runtime("chat");
  return providerGenerateText({
    runtime: resolved,
    model: resolved.model,
    systemPrompt: params.systemPrompt,
    userMessage: params.userMessage,
    contextJson: params.contextJson,
  });
}

export async function analyzeImage(params: {
  systemPrompt: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  contextJson: string | null;
}): Promise<AiResult> {
  const resolved = await runtime("chart");
  return providerAnalyzeImage({
    runtime: resolved,
    model: resolved.model,
    systemPrompt: params.systemPrompt,
    prompt: params.prompt,
    imageBase64: params.imageBase64,
    mimeType: params.mimeType,
    contextJson: params.contextJson,
  });
}
