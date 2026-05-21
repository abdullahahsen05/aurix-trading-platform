import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const patchSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  timezone: z.string().optional(),
});

export async function PATCH(request: Request) {
  try {
    const user = await requireAuth();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return jsonFail("INVALID_BODY", parsed.error.message, 400);

    const supabase = await createClient();
    const updates: Record<string, string> = {};
    if (parsed.data.fullName) updates.full_name = parsed.data.fullName;
    if (parsed.data.timezone) updates.timezone = parsed.data.timezone;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);
      if (error) return jsonFail("UPDATE_FAILED", error.message, 500);
    }

    return jsonOk({ updated: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
