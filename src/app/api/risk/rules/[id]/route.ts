import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { updateRiskRule } from "@/lib/services/riskService";
import { z } from "zod";

const updateRuleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  threshold: z.number().positive().optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const parsed = updateRuleSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("INVALID_BODY", parsed.error.issues.map(i => i.message).join(", "), 400);
    }
    const updated = await updateRiskRule(id, parsed.data);
    return jsonOk(updated);
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
