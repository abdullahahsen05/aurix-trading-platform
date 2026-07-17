import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { listPasskeys, PasskeyError, revokePasskey } from "@/lib/services/passkeyService";

export async function GET() {
  try {
    const user = await requireAuth();
    if (user.role !== "TRADER") return jsonFail("FORBIDDEN", "Trader access required.", 403);
    return jsonOk(await listPasskeys(user.id));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PasskeyError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth();
    if (user.role !== "TRADER") return jsonFail("FORBIDDEN", "Trader access required.", 403);
    const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", "A valid passkey ID is required.", 400);
    await revokePasskey(user.id, parsed.data.id);
    return jsonOk({ revoked: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PasskeyError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
