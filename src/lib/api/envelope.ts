import type { ApiFailure, ApiSuccess } from "@/lib/domain/types";
import { AuthError } from "@/lib/auth/session";

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

export function handleAuthError(error: unknown): Response {
  if (error instanceof AuthError) {
    return jsonFail(error.code, error.message, error.statusCode);
  }
  return jsonFail("INTERNAL_ERROR", "An unexpected error occurred", 500);
}
