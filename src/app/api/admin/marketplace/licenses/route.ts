import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin } from "@/lib/auth/session";
import { adminListAllLicenses } from "@/lib/services/botLicenseService";

export async function GET() {
  try {
    await requireAdmin();
    const licenses = await adminListAllLicenses();
    return jsonOk(licenses);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
