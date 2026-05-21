import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listCrmNotes, createCrmNote } from "@/lib/services/crmService";
import { crmNoteCreateSchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const traderId = new URL(request.url).searchParams.get("traderId") ?? undefined;
    return jsonOk(await listCrmNotes(traderId));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const parsed = crmNoteCreateSchema.safeParse(await request.json());
    if (!parsed.success) return jsonFail("INVALID_BODY", parsed.error.message, 400);

    const note = await createCrmNote({
      traderId: parsed.data.traderId,
      note: parsed.data.note,
      authorName: user.name,
      authorUserId: user.id,
    });

    return jsonOk(note, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
