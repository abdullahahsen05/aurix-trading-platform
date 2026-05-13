import { jsonOk } from "@/lib/api/envelope";
import { listTradingAccounts } from "@/lib/services/tradingAccountService";

export async function GET() {
  return jsonOk(await listTradingAccounts());
}
