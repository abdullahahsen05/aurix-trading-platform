import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAuth } from "@/lib/auth/session";
import { getProtectedBotDownload } from "@/lib/services/botReleaseService";
import { writeAuditLog } from "@/lib/services/auditService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ accessId: string }> },
) {
  try {
    const user = await requireAuth();
    if (user.role !== "TRADER") {
      return jsonFail("FORBIDDEN", "Only traders can download purchased bots.", 403);
    }

    const { accessId } = await context.params;
    const result = await getProtectedBotDownload({ accessId, userId: user.id });

    await writeAuditLog({
      actorUserId: user.id,
      action: "BOT_FILE_DOWNLOADED",
      entityType: "bot_file_release",
      entityId: result.release.id,
      metadata: {
        accessId,
        productId: result.release.productId,
        version: result.release.version,
      },
    });

    return jsonOk({
      downloadUrl: result.downloadUrl,
      fileName: result.release.originalFileName,
      expiresInSeconds: 60,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonFail(error.code, error.message, error.statusCode);
    }
    const message = error instanceof Error ? error.message : "Download could not be prepared.";
    const status = message.includes("not found") || message.includes("No downloadable") ? 404 : 403;
    return jsonFail("BOT_DOWNLOAD_DENIED", message, status);
  }
}
