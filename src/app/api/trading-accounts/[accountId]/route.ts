import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { getTradingAccount } from "@/lib/services/tradingAccountService";

export async function GET(
  _request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const user = await requireAuth();
    const { accountId } = await context.params;
    const account = await getTradingAccount(accountId, user.id, user.role);
    if (!account) return jsonFail("ACCOUNT_NOT_FOUND", "Trading account was not found.", 404);
    return jsonOk(account);
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
