import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { getJobStats, listJobs } from "@/lib/services/backgroundJobService";
import type { JobStatus, JobType } from "@/lib/jobs/types";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const sp = new URL(request.url).searchParams;
    const status = (sp.get("status") as JobStatus | null) ?? undefined;
    const type = (sp.get("type") as JobType | null) ?? undefined;
    const [jobs, stats] = await Promise.all([listJobs({ status, type }), getJobStats()]);
    return jsonOk({ jobs, stats });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
