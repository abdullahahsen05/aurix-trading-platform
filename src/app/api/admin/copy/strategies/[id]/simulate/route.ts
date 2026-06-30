import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { simulateStrategy } from "@/lib/services/copyTradingService";
import { CopyError } from "@/lib/copy/types";

// POST — dry-run the strategy across its un-simulated master events. No execution.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    return jsonOk(await simulateStrategy(id, admin.id));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof CopyError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
