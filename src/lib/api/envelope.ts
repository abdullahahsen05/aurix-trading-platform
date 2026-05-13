import type { ApiFailure, ApiSuccess } from "@/lib/domain/types";

export function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string): ApiFailure {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json(ok(data), init);
}

export function jsonFail(code: string, message: string, status = 400): Response {
  return Response.json(fail(code, message), { status });
}
