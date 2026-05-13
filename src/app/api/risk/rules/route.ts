import { jsonOk } from "@/lib/api/envelope";
import { listRiskRules } from "@/lib/services/riskService";

export async function GET() {
  return jsonOk(await listRiskRules());
}
