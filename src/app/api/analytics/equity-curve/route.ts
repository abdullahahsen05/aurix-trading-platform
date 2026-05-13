import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { getEquityCurve } from "@/lib/services/analyticsService";
import { accountIdSchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  const parsed = accountIdSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return jsonFail("INVALID_QUERY", parsed.error.message, 400);

  return jsonOk(await getEquityCurve(parsed.data.accountId));
}
