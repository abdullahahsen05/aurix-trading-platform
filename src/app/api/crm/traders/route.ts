import { jsonOk } from "@/lib/api/envelope";
import { listTraderProfiles } from "@/lib/services/crmService";

export async function GET() {
  return jsonOk(await listTraderProfiles());
}
