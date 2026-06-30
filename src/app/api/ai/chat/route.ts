import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { aiChatSchema } from "@/lib/validation/schemas";
import { AI_ERROR, AiError } from "@/lib/ai/types";
import { checkLimit, logUsage } from "@/lib/ai/rateLimit";
import { buildTraderAiContext } from "@/lib/ai/contextBuilder";
import { buildChatSystemPrompt } from "@/lib/ai/systemPrompt";
import { chatModel, generateText } from "@/lib/ai/geminiClient";

// POST /api/ai/chat — branded Aurix AI text chat (Gemini Flash-tier model).
export async function POST(request: Request) {
  try {
    const user = await requireTrader();

    // 1. Validate (failed validation never consumes quota).
    const body = await request.json().catch(() => null);
    const parsed = aiChatSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail(AI_ERROR.INVALID_MESSAGE, parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    // 2. Rate-limit check BEFORE the provider call.
    const limitState = await checkLimit(user.id, "chat");

    // 3. Build authoritative, self-scoped context (throws FORBIDDEN if the
    //    accountId is not owned by this user).
    const context = await buildTraderAiContext({
      userId: user.id,
      role: user.role,
      name: user.name,
      accountId: parsed.data.accountId,
      pageContext: parsed.data.pageContext ?? null,
    });

    // 4. Provider call.
    const model = chatModel();
    let result;
    try {
      result = await generateText({
        model,
        systemPrompt: buildChatSystemPrompt(),
        userMessage: parsed.data.message,
        contextJson: JSON.stringify(context),
      });
    } catch (providerErr) {
      // Log as FAILED (does not consume the daily allowance).
      await logUsage({
        userId: user.id,
        route: "chat",
        model,
        requestType: "text",
        status: "FAILED",
        metadata: { pageContext: parsed.data.pageContext ?? null },
      });
      throw providerErr;
    }

    // 5. Log SUCCESS (this is what consumes the daily allowance).
    await logUsage({
      userId: user.id,
      route: "chat",
      model: result.model,
      requestType: "text",
      status: "SUCCESS",
      usage: result.usage,
      metadata: {
        pageContext: parsed.data.pageContext ?? null,
        hasAccount: Boolean(parsed.data.accountId),
      },
    });

    return jsonOk({
      message: result.text,
      model: result.model,
      usage: { requestsRemainingToday: Math.max(0, limitState.remaining - 1) },
    });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof AiError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
