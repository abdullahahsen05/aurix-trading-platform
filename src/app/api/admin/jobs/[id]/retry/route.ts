import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { requeueJob } from "@/lib/services/backgroundJobService";
import { writeAuditLog } from "@/lib/services/auditService";

// POST /api/admin/jobs/[id]/retry — re-queue a terminal (FAILED/CANCELLED/SKIPPED) job.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const requeued = await requeueJob(id);
    if (!requeued) {
      return jsonFail("JOB_NOT_RETRYABLE", "Only failed, cancelled, or skipped jobs can be retried.", 409);
    }
    await writeAuditLog({
      actorUserId: admin.id,
      action: "JOB_RETRIED",
      entityType: "background_job",
      entityId: id,
      metadata: {},
    });
    return jsonOk({ requeued: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
