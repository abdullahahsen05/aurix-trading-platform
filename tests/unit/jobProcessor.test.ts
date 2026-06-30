import { describe, expect, test } from "vitest";
import { processJob } from "@/lib/workers/jobProcessor";
import type { BackgroundJob, JobType } from "@/lib/jobs/types";

function job(type: JobType, payload: Record<string, unknown> = {}): BackgroundJob {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    type,
    status: "RUNNING",
    priority: 100,
    runAfter: new Date().toISOString(),
    attempts: 1,
    maxAttempts: 3,
    uniqueKey: null,
    lockedAt: null,
    lockedBy: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    payload,
    result: null,
    createdBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("processJob — validation & dispatch guards (no DB)", () => {
  test("missing required id → FAILED, non-retryable VALIDATION_ERROR", async () => {
    const r = await processJob(job("SYNC_ACCOUNT", {}));
    expect(r.status).toBe("FAILED");
    expect(r.errorCode).toBe("VALIDATION_ERROR");
    expect(r.retry).toBe(false);
  });

  test("monitor without strategyId → FAILED non-retryable", async () => {
    const r = await processJob(job("MONITOR_COPY_STRATEGY", {}));
    expect(r.status).toBe("FAILED");
    expect(r.retry).toBe(false);
  });

  test("unknown job type → FAILED non-retryable", async () => {
    const r = await processJob(job("NOT_A_TYPE" as JobType));
    expect(r.status).toBe("FAILED");
    expect(r.errorCode).toBe("UNKNOWN_JOB_TYPE");
    expect(r.retry).toBe(false);
  });
});
