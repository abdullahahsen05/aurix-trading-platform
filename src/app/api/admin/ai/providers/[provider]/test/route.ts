import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { aiProviderSchema } from "@/lib/ai/providerValidation";
import { AuthError, requireSuperAdmin } from "@/lib/auth/session";
import { testStoredAiProvider } from "@/lib/services/aiProviderService";

export async function POST(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    const user = await requireSuperAdmin();
    const parsed = aiProviderSchema.safeParse((await context.params).provider.toUpperCase());
    if (!parsed.success) return jsonFail("INVALID_AI_PROVIDER", "Unsupported AI provider.", 400);
    const result = await testStoredAiProvider({
      provider: parsed.data,
      actorUserId: user.id,
    });
    return jsonOk(result);
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    const message = error instanceof Error ? error.message : "Provider validation failed.";
    if (message.startsWith("Save a provider") || message.startsWith("The stored key")) {
      return jsonFail("AI_PROVIDER_NOT_CONFIGURED", message, 400);
    }
    return jsonFail("AI_PROVIDER_TEST_FAILED", "Provider validation could not be completed.", 500);
  }
}
