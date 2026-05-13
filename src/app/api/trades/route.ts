import { jsonFail, jsonOk } from "@/lib/api/envelope";
import type { TradeStatus } from "@/lib/domain/types";
import { listTrades } from "@/lib/services/tradeService";
import { tradeQuerySchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  const parsed = tradeQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return jsonFail("INVALID_QUERY", parsed.error.message, 400);

  return jsonOk(
    await listTrades({
      accountId: parsed.data.accountId,
      status: parsed.data.status as TradeStatus | undefined,
    }),
  );
}
