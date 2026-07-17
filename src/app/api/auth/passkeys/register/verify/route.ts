import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { PasskeyConfigurationError } from "@/lib/auth/passkeyConfig";
import { PasskeyError, verifyPasskeyRegistration } from "@/lib/services/passkeyService";

const bodySchema = z.object({
  challengeId: z.string().uuid(),
  deviceName: z.string().trim().min(1).max(80),
  response: z.unknown(),
});

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    if (user.role !== "TRADER") return jsonFail("FORBIDDEN", "Passkeys can only be registered by trader users.", 403);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", "Invalid passkey registration response.", 400);
    return jsonOk(await verifyPasskeyRegistration({
      user,
      challengeId: parsed.data.challengeId,
      deviceName: parsed.data.deviceName,
      response: parsed.data.response as RegistrationResponseJSON,
    }), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PasskeyError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PasskeyConfigurationError) return jsonFail("PASSKEY_NOT_CONFIGURED", err.message, 503);
    throw err;
  }
}
