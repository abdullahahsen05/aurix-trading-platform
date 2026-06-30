import { requireAdmin } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const SettingsSchema = z.object({
  provider: z.enum(["mock", "dxfeed"]).optional(),
  is_enabled: z.boolean().optional(),
  demo_mode: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const parsed = SettingsSchema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation error", 400);
    if (Object.keys(parsed.data).length === 0) return jsonFail("NO_FIELDS", "No fields to update", 400);

    const db = createAdminClient();

    // Always update the single settings row
    const { error } = await db
      .from("terminal_provider_settings")
      .update({
        ...parsed.data,
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      })
      .not("id", "is", null); // match all rows (single-row table)

    if (error) throw error;

    await writeAuditLog({
      actorUserId: admin.id,
      action: "TERMINAL_SETTINGS_UPDATED",
      entityType: "terminal_provider_settings",
      entityId: null,
      metadata: { changes: parsed.data },
    });

    return jsonOk({ updated: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
