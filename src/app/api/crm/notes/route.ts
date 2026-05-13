import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { listCrmNotes } from "@/lib/services/crmService";
import { crmNoteCreateSchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  const traderId = new URL(request.url).searchParams.get("traderId") ?? undefined;
  return jsonOk(await listCrmNotes(traderId));
}

export async function POST(request: Request) {
  const parsed = crmNoteCreateSchema.safeParse(await request.json());
  if (!parsed.success) return jsonFail("INVALID_BODY", parsed.error.message, 400);

  return jsonOk(
    {
      id: `note-${Date.now()}`,
      authorName: "Admin",
      createdAt: new Date().toISOString(),
      ...parsed.data,
    },
    { status: 201 },
  );
}
