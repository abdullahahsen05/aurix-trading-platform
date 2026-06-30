import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { enqueueJob } from "@/lib/services/backgroundJobService";
import { writeAuditLog } from "@/lib/services/auditService";
import { jobEnqueueSchema } from "@/lib/validation/schemas";

// POST /api/admin/jobs/enqueue — admin queues a job. Payload holds IDs only.
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => null);
    const parsed = jobEnqueueSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    // For single-target jobs, set a unique key so duplicates collapse.
    const p = parsed.data.payload ?? {};
    const id = p.accountId ?? p.strategyId ?? p.masterEventId ?? p.copyExecutionLogId;
    const uniqueKey = id ? `${parsed.data.type}:${id}` : `${parsed.data.type}`;

    const job = await enqueueJob({
      type: parsed.data.type,
      payload: parsed.data.payload,
      uniqueKey,
      createdBy: admin.id,
    });

    await writeAuditLog({
      actorUserId: admin.id,
      action: "JOB_ENQUEUED",
      entityType: "background_job",
      entityId: job.id,
      metadata: { type: job.type },
    });

    return jsonOk(job, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
