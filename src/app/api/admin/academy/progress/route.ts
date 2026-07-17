import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listAcademyProgressForAdmin } from "@/lib/services/academyProgressService";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(await listAcademyProgressForAdmin());
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
