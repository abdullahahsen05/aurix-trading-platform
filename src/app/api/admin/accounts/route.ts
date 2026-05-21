import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listAllAccounts } from "@/lib/services/adminService";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(await listAllAccounts());
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
