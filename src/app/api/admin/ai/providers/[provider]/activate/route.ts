import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { aiProviderSchema } from "@/lib/ai/providerValidation";
import { AuthError, requireSuperAdmin } from "@/lib/auth/session";
import { activateAiProvider } from "@/lib/services/aiProviderService";

export async function POST(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    const user = await requireSuperAdmin();
    const parsed = aiProviderSchema.safeParse((await context.params).provider.toUpperCase());
    if (!parsed.success) return jsonFail("INVALID_AI_PROVIDER", "Unsupported AI provider.", 400);
    await activateAiProvider({ provider: parsed.data, actorUserId: user.id });
    return jsonOk({ provider: parsed.data, active: true });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Test this provider")) {
      return jsonFail("AI_PROVIDER_NOT_VALIDATED", message, 409);
    }
    return jsonFail("AI_PROVIDER_ACTIVATE_FAILED", "The provider could not be activated.", 500);
  }
}
