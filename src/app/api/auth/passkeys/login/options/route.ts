import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { PasskeyConfigurationError } from "@/lib/auth/passkeyConfig";
import { PasskeyError, startPasskeyAuthentication } from "@/lib/services/passkeyService";

export async function POST() {
  try {
    return jsonOk(await startPasskeyAuthentication());
  } catch (err) {
    if (err instanceof PasskeyError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PasskeyConfigurationError) return jsonFail("PASSKEY_NOT_CONFIGURED", err.message, 503);
    throw err;
  }
}
