import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { getEquityCurve } from "@/lib/services/analyticsService";
import { accountIdSchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const parsed = accountIdSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return jsonFail("INVALID_QUERY", parsed.error.message, 400);

    return jsonOk(await getEquityCurve(parsed.data.accountId, user.id, user.role));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
