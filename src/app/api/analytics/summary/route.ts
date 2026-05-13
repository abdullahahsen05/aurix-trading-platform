import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { getAnalyticsSummary } from "@/lib/services/analyticsService";
import { analyticsSummaryQuerySchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  const parsed = analyticsSummaryQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return jsonFail("INVALID_QUERY", parsed.error.message, 400);

  return jsonOk(await getAnalyticsSummary(parsed.data.accountId));
}
