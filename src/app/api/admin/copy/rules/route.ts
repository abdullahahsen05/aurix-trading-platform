import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { CopyError } from "@/lib/copy/types";
import { getCopyAccountRule, upsertCopyAccountRule } from "@/lib/services/copyTradingService";
import { copyAccountRuleSchema } from "@/lib/validation/schemas";

const accountIdSchema = z.string().uuid();

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const accountId = new URL(request.url).searchParams.get("accountId");
    const parsedId = accountIdSchema.safeParse(accountId);
    if (!parsedId.success) return jsonFail("VALIDATION_ERROR", "A valid accountId is required", 400);
    return jsonOk(await getCopyAccountRule(parsedId.data));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof CopyError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => null);
    const parsed = z.object({ accountId: accountIdSchema, rules: copyAccountRuleSchema }).safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }
    return jsonOk(await upsertCopyAccountRule(parsed.data.accountId, parsed.data.rules, admin.id));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof CopyError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
