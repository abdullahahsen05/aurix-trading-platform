import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { aiChartPromptSchema } from "@/lib/validation/schemas";
import { AI_ERROR, AiError } from "@/lib/ai/types";
import { checkLimit, logUsage } from "@/lib/ai/rateLimit";
import { buildAdminImageSystemPrompt } from "@/lib/ai/systemPrompt";
import { analyzeImage, chartModel } from "@/lib/ai/geminiClient";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

function buildAnalysisPrompt(focus: string | undefined): string {
  return focus
    ? `Analyze the supplied image with this focus: ${focus}`
    : "Describe and analyze the visible contents of this image. Identify uncertainty and do not infer off-screen data.";
}

// Generic image analysis is restricted to ADMIN and SUPER_ADMIN.
export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonFail(AI_ERROR.INVALID_IMAGE, "Expected an image upload.", 400);
    }

    const file = form.get("image");
    if (!(file instanceof File)) {
      return jsonFail(AI_ERROR.INVALID_IMAGE, "Image is required.", 400);
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return jsonFail(AI_ERROR.INVALID_IMAGE, "Unsupported image type. Use PNG, JPG, or WebP.", 400);
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return jsonFail(AI_ERROR.INVALID_IMAGE, "Image is too large. Max size is 5MB.", 400);
    }

    const promptRaw = form.get("prompt");
    const prompt = aiChartPromptSchema.safeParse(
      typeof promptRaw === "string" ? promptRaw : undefined,
    );
    if (!prompt.success) {
      return jsonFail(
        AI_ERROR.INVALID_MESSAGE,
        prompt.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const limitState = await checkLimit(user.id, "chart-analysis");
    const model = chartModel();
    let result;
    try {
      result = await analyzeImage({
        model,
        systemPrompt: buildAdminImageSystemPrompt(),
        prompt: buildAnalysisPrompt(prompt.data),
        imageBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        mimeType: file.type,
        contextJson: null,
      });
    } catch (providerError) {
      await logUsage({
        userId: user.id,
        route: "chart-analysis",
        feature: "ADMIN_IMAGE_ANALYSIS",
        model,
        requestType: "vision",
        status: "FAILED",
        metadata: { role: user.role, mimeType: file.type },
      });
      throw providerError;
    }

    await logUsage({
      userId: user.id,
      route: "chart-analysis",
      feature: "ADMIN_IMAGE_ANALYSIS",
      model: result.model,
      requestType: "vision",
      status: "SUCCESS",
      usage: result.usage,
      metadata: { role: user.role, mimeType: file.type },
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
