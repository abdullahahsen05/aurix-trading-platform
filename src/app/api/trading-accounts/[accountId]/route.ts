import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { getTradingAccount } from "@/lib/services/tradingAccountService";

export async function GET(
  _request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  const { accountId } = await context.params;
  const account = await getTradingAccount(accountId);
  if (!account) return jsonFail("ACCOUNT_NOT_FOUND", "Trading account was not found.", 404);

  return jsonOk(account);
}
