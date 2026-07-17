import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { PasskeyConfigurationError } from "@/lib/auth/passkeyConfig";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PasskeyError, verifyPasskeyAuthentication } from "@/lib/services/passkeyService";

const bodySchema = z.object({ challengeId: z.string().uuid(), response: z.unknown() });

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", "Invalid passkey sign-in response.", 400);
    const identity = await verifyPasskeyAuthentication({
      challengeId: parsed.data.challengeId,
      response: parsed.data.response as AuthenticationResponseJSON,
    });

    // Bridge the verified WebAuthn identity into the existing Supabase cookie
    // session without changing password authentication or exposing a token.
    const admin = createAdminClient();
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: identity.email });
    if (linkError || !link.properties.hashed_token) throw new PasskeyError("Could not create the authenticated session.", "PASSKEY_SESSION_FAILED", 500);
    const supabase = await createClient();
    const { error: sessionError } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
    if (sessionError) throw new PasskeyError("Could not create the authenticated session.", "PASSKEY_SESSION_FAILED", 500);

    return jsonOk({ userId: identity.userId, role: "TRADER", redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof PasskeyError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PasskeyConfigurationError) return jsonFail("PASSKEY_NOT_CONFIGURED", err.message, 503);
    throw err;
  }
}
