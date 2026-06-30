import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { cancelJob } from "@/lib/services/backgroundJobService";
import { writeAuditLog } from "@/lib/services/auditService";

// POST /api/admin/jobs/[id]/cancel — cancel a PENDING job.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const cancelled = await cancelJob(id);
    if (!cancelled) {
      return jsonFail("JOB_NOT_CANCELLABLE", "Only pending jobs can be cancelled.", 409);
    }
    await writeAuditLog({
      actorUserId: admin.id,
      action: "JOB_CANCELLED",
      entityType: "background_job",
      entityId: id,
      metadata: {},
    });
    return jsonOk({ cancelled: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
