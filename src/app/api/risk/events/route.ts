import { jsonOk } from "@/lib/api/envelope";
import { listRiskEvents } from "@/lib/services/riskService";

export async function GET(request: Request) {
  const accountId = new URL(request.url).searchParams.get("accountId") ?? undefined;
  return jsonOk(await listRiskEvents(accountId));
}
