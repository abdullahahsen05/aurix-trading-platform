import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { aiProviderSchema } from "@/lib/ai/providerValidation";
import { AuthError, requireSuperAdmin } from "@/lib/auth/session";
import { deleteAiProviderKey } from "@/lib/services/aiProviderService";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    const user = await requireSuperAdmin();
    const parsed = aiProviderSchema.safeParse((await context.params).provider.toUpperCase());
    if (!parsed.success) return jsonFail("INVALID_AI_PROVIDER", "Unsupported AI provider.", 400);
    await deleteAiProviderKey({ provider: parsed.data, actorUserId: user.id });
    return jsonOk({ provider: parsed.data, deleted: true });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("AI_PROVIDER_DELETE_FAILED", "The provider key could not be deleted.", 500);
  }
}
