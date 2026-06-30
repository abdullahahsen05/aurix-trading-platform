import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { executeCopyForEvent } from "@/lib/services/copyTradingService";
import { CopyError } from "@/lib/copy/types";

// POST — attempt LIVE copy execution for a master event. Fully gated; when live
// execution is not enabled this returns COPY_EXECUTION_NOT_CONFIGURED. Per-follower
// failures are logged, never faked.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const summary = await executeCopyForEvent(id, admin.id);
    return jsonOk(summary);
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof CopyError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
