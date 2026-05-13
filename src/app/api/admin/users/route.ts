import { jsonOk } from "@/lib/api/envelope";
import { listAdminUsers } from "@/lib/services/adminService";

export async function GET() {
  return jsonOk(await listAdminUsers());
}
