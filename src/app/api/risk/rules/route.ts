import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, requireAuth, AuthError } from "@/lib/auth/session";
import { createRiskRule, listRiskRules } from "@/lib/services/riskService";
import { z } from "zod";

const createRuleSchema = z.object({
  accountId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(100),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
  action: z.enum(["WARN", "LIMIT", "RESTRICT"]),
  metric: z.enum(["DAILY_LOSS", "MAX_DRAWDOWN", "OPEN_TRADES"]),
  threshold: z.number().positive(),
});

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const accountId = new URL(request.url).searchParams.get("accountId") ?? undefined;
    return jsonOk(await listRiskRules(accountId, user.id, user.role));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const parsed = createRuleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonFail(
        "INVALID_BODY",
        parsed.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }
    return jsonOk(await createRiskRule(parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    if (error instanceof Error && error.message.includes("duplicate key")) {
      return jsonFail(
        "RISK_RULE_EXISTS",
        "A rule for this metric and scope already exists. Edit the existing rule instead.",
        409,
      );
    }
    return jsonFail(
      "RISK_RULE_CREATE_FAILED",
      error instanceof Error ? error.message : "Risk rule could not be created.",
      400,
    );
  }
}
