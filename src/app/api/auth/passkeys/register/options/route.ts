import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { PasskeyConfigurationError } from "@/lib/auth/passkeyConfig";
import { PasskeyError, startPasskeyRegistration } from "@/lib/services/passkeyService";

export async function POST() {
  try {
    const user = await requireAuth();
    if (user.role !== "TRADER") return jsonFail("FORBIDDEN", "Passkeys can only be registered by trader users.", 403);
    return jsonOk(await startPasskeyRegistration(user));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PasskeyError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PasskeyConfigurationError) return jsonFail("PASSKEY_NOT_CONFIGURED", err.message, 503);
    throw err;
  }
}
