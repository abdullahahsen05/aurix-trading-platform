import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { createCopyStrategy, listCopyStrategies } from "@/lib/services/copyTradingService";
import { copyStrategyCreateSchema } from "@/lib/validation/schemas";
import { CopyError } from "@/lib/copy/types";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(await listCopyStrategies());
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => null);
    const parsed = copyStrategyCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }
    return jsonOk(await createCopyStrategy(parsed.data, admin.id), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof CopyError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
