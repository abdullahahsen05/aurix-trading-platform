if (typeof window !== "undefined") {
  throw new Error("[aurix] workerAuth is server-only.");
}

import { requireAdmin } from "@/lib/auth/session";

// ─────────────────────────────────────────────────────────────────────────────
// Authorization for the worker routes (server-only).
//   • If WORKER_SECRET is set → require an exact `x-worker-secret` header match.
//   • If unset in production → refuse (misconfiguration).
//   • If unset in development → fall back to admin-authenticated calls only.
// ─────────────────────────────────────────────────────────────────────────────

export class WorkerAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "WorkerAuthError";
  }
}

export async function authorizeWorker(request: Request): Promise<void> {
  const secret = process.env.WORKER_SECRET?.trim();

  if (secret) {
    const header = request.headers.get("x-worker-secret");
    if (header && header === secret) return;
    throw new WorkerAuthError("FORBIDDEN", "Invalid or missing worker secret.", 403);
  }

  if (process.env.NODE_ENV === "production") {
    throw new WorkerAuthError(
      "WORKER_NOT_CONFIGURED",
      "WORKER_SECRET is not configured. Set it before invoking the worker in production.",
      503,
    );
  }

  // Development convenience: allow an authenticated admin to invoke the worker.
  await requireAdmin();
}
