import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { listTradingAccounts, createTradingAccount } from "@/lib/services/tradingAccountService";
import { z } from "zod";

const createAccountSchema = z.object({
  accountName: z.string().min(2).max(100),
  brokerName: z.string().min(2).max(100),
  brokerAccountId: z.string().optional(),
  currency: z.string().length(3).default("USD"),
});

export async function GET() {
  try {
    const user = await requireAuth();
    return jsonOk(
      await listTradingAccounts(user.id, user.role),
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("INVALID_BODY", parsed.error.issues.map(i => i.message).join(", "), 400);
    }
    const account = await createTradingAccount(user.id, parsed.data);
    return jsonOk(account, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
