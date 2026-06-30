import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { getAiUsageSummary } from "@/lib/services/aiAdminService";

// GET /api/admin/ai/usage — platform AI usage analytics (admin).
export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(await getAiUsageSummary());
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
