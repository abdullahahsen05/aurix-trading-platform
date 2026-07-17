import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { AnalyticsAccessError, getAnalyticsSummary } from "@/lib/services/analyticsService";
import { analyticsSummaryQuerySchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const parsed = analyticsSummaryQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) return jsonFail("INVALID_QUERY", parsed.error.message, 400);

    return jsonOk(
      await getAnalyticsSummary(parsed.data.accountId, user.id, user.role, parsed.data.period),
    );
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof AnalyticsAccessError) return jsonFail("FORBIDDEN", err.message, 403);
    throw err;
  }
}
