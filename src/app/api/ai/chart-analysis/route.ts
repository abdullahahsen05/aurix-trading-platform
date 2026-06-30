import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { aiChartPromptSchema } from "@/lib/validation/schemas";
import { AI_ERROR, AiError } from "@/lib/ai/types";
import { checkLimit, logUsage } from "@/lib/ai/rateLimit";
import { buildTraderAiContext } from "@/lib/ai/contextBuilder";
import { buildChartSystemPrompt } from "@/lib/ai/systemPrompt";
import { analyzeImage, chartModel } from "@/lib/ai/geminiClient";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildAnalysisPrompt(focus: string | undefined): string {
  const base =
    "Analyze this trading chart screenshot. Cover: trend direction, market structure, " +
    "key support/resistance zones, visible chart patterns, possible risk zones, " +
    "invalidation levels, and scalping considerations. Use cautious, educational language " +
    "and end with a short risk disclaimer.";
  return focus ? `${base}\n\nThe trader asked you to focus especially on: ${focus}` : base;
}

// POST /api/ai/chart-analysis — multimodal screenshot analysis (Gemini Pro-tier model).
export async function POST(request: Request) {
  try {
    const user = await requireTrader();

    // 1. Parse multipart form (failed validation never consumes quota).
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonFail(AI_ERROR.INVALID_IMAGE, "Expected an image upload.", 400);
    }

    const file = form.get("image");
    if (!(file instanceof File)) {
      return jsonFail(AI_ERROR.INVALID_IMAGE, "Chart image is required.", 400);
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return jsonFail(AI_ERROR.INVALID_IMAGE, "Unsupported image type. Use PNG, JPG, or WebP.", 400);
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return jsonFail(AI_ERROR.INVALID_IMAGE, "Chart image is too large. Max size is 5MB.", 400);
    }

    const focusRaw = form.get("prompt");
    const focusParsed = aiChartPromptSchema.safeParse(
      typeof focusRaw === "string" ? focusRaw : undefined,
    );
    if (!focusParsed.success) {
      return jsonFail(AI_ERROR.INVALID_MESSAGE, focusParsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const accountIdRaw = form.get("accountId");
    const accountId = typeof accountIdRaw === "string" && UUID_RE.test(accountIdRaw) ? accountIdRaw : undefined;

    // 2. Rate-limit check BEFORE the provider call (separate chart allowance).
    const limitState = await checkLimit(user.id, "chart-analysis");

    // 3. Optional account context (ownership-checked inside the builder).
    const context = accountId
      ? await buildTraderAiContext({
          userId: user.id,
          role: user.role,
          name: user.name,
          accountId,
          pageContext: "chart-analysis",
        })
      : null;

    // 4. Convert image to base64 for the SDK.
    const imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const model = chartModel();

    let result;
    try {
      result = await analyzeImage({
        model,
        systemPrompt: buildChartSystemPrompt(),
        prompt: buildAnalysisPrompt(focusParsed.data),
        imageBase64,
        mimeType: file.type,
        contextJson: context ? JSON.stringify(context) : null,
      });
    } catch (providerErr) {
      await logUsage({
        userId: user.id,
        route: "chart-analysis",
        model,
        requestType: "vision",
        status: "FAILED",
        metadata: { mimeType: file.type, hasAccount: Boolean(accountId) },
      });
      throw providerErr;
    }

    // 5. Log SUCCESS (consumes the daily chart allowance).
    await logUsage({
      userId: user.id,
      route: "chart-analysis",
      model: result.model,
      requestType: "vision",
      status: "SUCCESS",
      usage: result.usage,
      metadata: { mimeType: file.type, hasAccount: Boolean(accountId) },
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
