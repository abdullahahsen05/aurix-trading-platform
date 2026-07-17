import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { getMyAcademyProgress } from "@/lib/services/academyProgressService";

export async function GET() {
  try {
    const trader = await requireTrader();
    return jsonOk(await getMyAcademyProgress(trader.id));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
