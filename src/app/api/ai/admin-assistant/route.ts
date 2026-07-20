import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { aiChatSchema } from "@/lib/validation/schemas";
import { AI_ERROR, AiError } from "@/lib/ai/types";
import { checkLimit, logUsage } from "@/lib/ai/rateLimit";
import { buildAdminAssistantSystemPrompt } from "@/lib/ai/systemPrompt";
import { generateText } from "@/lib/ai/providerClient";

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const parsed = aiChatSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonFail(
        AI_ERROR.INVALID_MESSAGE,
        parsed.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const limitState = await checkLimit(user.id, "chat");
    let model = "configured-provider";
    let result;
    try {
      result = await generateText({
        systemPrompt: buildAdminAssistantSystemPrompt(),
        userMessage: parsed.data.message,
        contextJson: null,
      });
      model = result.model;
    } catch (providerError) {
      await logUsage({
        userId: user.id,
        route: "chat",
        feature: "ADMIN_ASSISTANT",
        model,
        requestType: "text",
        status: "FAILED",
        metadata: { role: user.role, pageContext: "admin-ai-controls" },
      });
      throw providerError;
    }

    await logUsage({
      userId: user.id,
      route: "chat",
      feature: "ADMIN_ASSISTANT",
      model: result.model,
      requestType: "text",
      status: "SUCCESS",
      usage: result.usage,
      metadata: { role: user.role, pageContext: "admin-ai-controls" },
    });

    return jsonOk({
      message: result.text,
      usage: { requestsRemainingToday: Math.max(0, limitState.remaining - 1) },
    });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    if (error instanceof AiError) return jsonFail(error.code, error.message, error.statusCode);
    throw error;
  }
}
