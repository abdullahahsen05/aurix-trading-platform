import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listAiUsers } from "@/lib/services/aiAdminService";

// GET /api/admin/ai/users — users with their AI limits + today's usage (admin).
export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(await listAiUsers());
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
