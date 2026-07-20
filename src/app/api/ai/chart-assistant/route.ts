import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAuth } from "@/lib/auth/session";
import { traderChartAssistantSchema } from "@/lib/validation/schemas";
import { AI_ERROR, AiError } from "@/lib/ai/types";
import { checkLimit, logUsage } from "@/lib/ai/rateLimit";
import { buildTraderAiContext } from "@/lib/ai/contextBuilder";
import {
  buildChartContextSystemPrompt,
  buildChartSystemPrompt,
} from "@/lib/ai/systemPrompt";
import {
  analyzeImage,
  generateText,
} from "@/lib/ai/providerClient";
import { canUseTraderChartAssistant } from "@/lib/ai/access";
import { isTraderChartCaptureEnabled } from "@/lib/ai/chartCapture";

const ALLOWED_CHART_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_CHART_BYTES = 5 * 1024 * 1024;

type ParsedPayload = {
  data?: ReturnType<typeof traderChartAssistantSchema.parse>;
  image?: File;
  error?: string;
};

async function parsePayload(request: Request): Promise<ParsedPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { error: "Expected chart capture form data." };
    }

    const parsed = traderChartAssistantSchema.safeParse({
      message: form.get("message"),
      symbol: form.get("symbol"),
      timeframe: form.get("timeframe"),
      accountId: form.get("accountId") || undefined,
    });
    if (!parsed.success) {
      return { error: parsed.error.issues.map((issue) => issue.message).join(", ") };
    }

    const imageValue = form.get("chartImage");
    if (imageValue !== null && !(imageValue instanceof File)) {
      return { error: "The chart capture is invalid." };
    }

    return { data: parsed.data, image: imageValue ?? undefined };
  }

  const parsed = traderChartAssistantSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues.map((issue) => issue.message).join(", ") };
  }
  return { data: parsed.data };
}

function validateChartImage(image: File): string | null {
  if (!ALLOWED_CHART_MIME.has(image.type)) {
    return "Unsupported chart capture type. Use PNG, JPG, or WebP.";
  }
  if (image.size === 0 || image.size > MAX_CHART_BYTES) {
    return "Chart capture is too large. Maximum size is 5MB.";
  }
  return null;
}

export async function GET() {
  try {
    const user = await requireAuth();
    if (!canUseTraderChartAssistant(user.role)) {
      return jsonFail("FORBIDDEN", "Trader chart assistant access required.", 403);
    }
    return jsonOk({ screenshotsEnabled: isTraderChartCaptureEnabled() });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    if (!canUseTraderChartAssistant(user.role)) {
      return jsonFail("FORBIDDEN", "Trader chart assistant access required.", 403);
    }

    const payload = await parsePayload(request);
    if (!payload.data || payload.error) {
      return jsonFail(AI_ERROR.INVALID_MESSAGE, payload.error ?? "Invalid request.", 400);
    }

    const screenshotsEnabled = isTraderChartCaptureEnabled();
    if (payload.image) {
      if (!screenshotsEnabled) {
        return jsonFail(
          AI_ERROR.DISABLED,
          "Live chart review is disabled on this deployment.",
          403,
        );
      }
      const imageError = validateChartImage(payload.image);
      if (imageError) return jsonFail(AI_ERROR.INVALID_IMAGE, imageError, 400);
    }

    const limitState = await checkLimit(user.id, "chart-analysis");
    const accountContext = await buildTraderAiContext({
      userId: user.id,
      role: user.role,
      name: user.name,
      accountId: payload.data.accountId,
      pageContext: "dashboard-tradingview",
    });
    const screenshotIncluded = Boolean(payload.image);
    let model = "configured-provider";
    const contextJson = JSON.stringify({
      chart: {
        symbol: payload.data.symbol,
        timeframe: payload.data.timeframe,
        screenshotIncluded,
        captureType: screenshotIncluded ? "temporary-tradingview-region" : "none",
        capturedAt: screenshotIncluded ? new Date().toISOString() : null,
      },
      account: accountContext,
    });

    let result;
    try {
      if (payload.image) {
        result = await analyzeImage({
          systemPrompt: buildChartSystemPrompt(),
          prompt: payload.data.message,
          imageBase64: Buffer.from(await payload.image.arrayBuffer()).toString("base64"),
          mimeType: payload.image.type,
          contextJson,
        });
      } else {
        result = await generateText({
          systemPrompt: buildChartContextSystemPrompt(),
          userMessage: payload.data.message,
          contextJson,
        });
      }
      model = result.model;
    } catch (providerError) {
      await logUsage({
        userId: user.id,
        route: "chart-analysis",
        feature: "TRADER_CHART_ASSISTANT",
        model,
        requestType: screenshotIncluded ? "chart-region-vision" : "chart-context-text",
        status: "FAILED",
        metadata: {
          role: user.role,
          symbol: payload.data.symbol,
          timeframe: payload.data.timeframe,
          hasAccount: Boolean(payload.data.accountId),
          screenshotIncluded,
        },
      });
      throw providerError;
    }

    await logUsage({
      userId: user.id,
      route: "chart-analysis",
      feature: "TRADER_CHART_ASSISTANT",
      model: result.model,
      requestType: screenshotIncluded ? "chart-region-vision" : "chart-context-text",
      status: "SUCCESS",
      usage: result.usage,
      metadata: {
        role: user.role,
        symbol: payload.data.symbol,
        timeframe: payload.data.timeframe,
        hasAccount: Boolean(payload.data.accountId),
        screenshotIncluded,
      },
    });

    return jsonOk({
      message: result.text,
      screenshotsEnabled,
      captureUsed: screenshotIncluded,
      usage: { requestsRemainingToday: Math.max(0, limitState.remaining - 1) },
    });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    if (error instanceof AiError) return jsonFail(error.code, error.message, error.statusCode);
    throw error;
  }
}
