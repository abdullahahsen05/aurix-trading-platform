import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { uploadBotRelease } from "@/lib/services/botReleaseService";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const fieldsSchema = z.object({
  version: z.string().trim().min(1).max(30),
  platform: z.enum(["MT4", "MT5"]),
  releaseNotes: z.string().trim().max(2000).optional(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const formData = await req.formData();
    const file = formData.get("file");
    const parsed = fieldsSchema.safeParse({
      version: formData.get("version"),
      platform: formData.get("platform"),
      releaseNotes: formData.get("releaseNotes") || undefined,
    });

    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid release details.", 400);
    }
    if (!(file instanceof File)) {
      return jsonFail("VALIDATION_ERROR", "Select a bot file to upload.", 400);
    }

    const release = await uploadBotRelease({
      productId: id,
      version: parsed.data.version,
      platform: parsed.data.platform,
      releaseNotes: parsed.data.releaseNotes,
      file,
      uploadedBy: admin.id,
    });

    await writeAuditLog({
      actorUserId: admin.id,
      action: "BOT_RELEASE_UPLOADED",
      entityType: "bot_file_release",
      entityId: release.id,
      metadata: {
        productId: id,
        version: release.version,
        platform: release.platform,
        fileSize: release.fileSize,
      },
    });

    return jsonOk(release, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonFail(error.code, error.message, error.statusCode);
    }
    const message = error instanceof Error ? error.message : "Bot upload failed.";
    const status = message === "Bot product not found." ? 404 : 400;
    return jsonFail("BOT_UPLOAD_FAILED", message, status);
  }
}
