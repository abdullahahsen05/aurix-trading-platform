import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BotPlatform, BotReleaseDto } from "@/lib/domain/types";

export const BOT_FILE_BUCKET = "bot-files";
export const MAX_BOT_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".ex4", ".ex5", ".zip"]);

export function getBotFileExtension(fileName: string): string | null {
  const safeName = fileName.split(/[\\/]/).pop() ?? "";
  const dotIndex = safeName.lastIndexOf(".");
  if (dotIndex < 1) return null;
  const extension = safeName.slice(dotIndex).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension) ? extension : null;
}

export function sanitizeBotFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? "bot-file";
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[_\.]+/, "");
  return (sanitized || "bot-file").slice(-140);
}

function rowToRelease(row: Record<string, unknown>): BotReleaseDto {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    version: row.version as string,
    platform: row.platform as "MT4" | "MT5",
    status: row.status as BotReleaseDto["status"],
    originalFileName: row.original_filename as string,
    fileSize: Number(row.file_size),
    checksumSha256: row.checksum_sha256 as string,
    releaseNotes: (row.release_notes as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function uploadBotRelease(params: {
  productId: string;
  version: string;
  platform: Exclude<BotPlatform, "BOTH">;
  releaseNotes?: string | null;
  file: File;
  uploadedBy: string;
}): Promise<BotReleaseDto> {
  const version = params.version.trim();
  if (!version || version.length > 30) throw new Error("Version must be between 1 and 30 characters.");
  if (params.file.size <= 0) throw new Error("The selected bot file is empty.");
  if (params.file.size > MAX_BOT_FILE_BYTES) throw new Error("Bot files cannot exceed 50 MB.");

  const extension = getBotFileExtension(params.file.name);
  if (!extension) throw new Error("Upload a compiled .ex4/.ex5 bot or a .zip bot package.");
  if (extension === ".ex4" && params.platform !== "MT4") {
    throw new Error(".ex4 bot files must use the MT4 platform.");
  }
  if (extension === ".ex5" && params.platform !== "MT5") {
    throw new Error(".ex5 bot files must use the MT5 platform.");
  }

  const supabase = createAdminClient();
  const { data: product, error: productError } = await supabase
    .from("bot_products")
    .select("id, platform")
    .eq("id", params.productId)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  if (!product) throw new Error("Bot product not found.");
  if (product.platform !== "BOTH" && product.platform !== params.platform) {
    throw new Error(`This product is configured for ${product.platform}, not ${params.platform}.`);
  }

  const bytes = Buffer.from(await params.file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const safeFileName = sanitizeBotFileName(params.file.name);
  const storagePath = `${params.productId}/${Date.now()}-${randomUUID()}-${safeFileName}`;
  const contentType = params.file.type || "application/octet-stream";

  const { error: uploadError } = await supabase.storage
    .from(BOT_FILE_BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      cacheControl: "0",
      upsert: false,
    });
  if (uploadError) throw new Error(`Bot file upload failed: ${uploadError.message}`);

  const publishedAt = new Date().toISOString();
  const { data: release, error: releaseError } = await supabase
    .from("bot_file_releases")
    .insert({
      product_id: params.productId,
      version,
      platform: params.platform,
      status: "PUBLISHED",
      storage_path: storagePath,
      original_filename: safeFileName,
      mime_type: contentType,
      file_size: params.file.size,
      checksum_sha256: checksum,
      release_notes: params.releaseNotes?.trim() || null,
      uploaded_by: params.uploadedBy,
      published_at: publishedAt,
    })
    .select("*")
    .single();

  if (releaseError || !release) {
    await supabase.storage.from(BOT_FILE_BUCKET).remove([storagePath]);
    throw new Error(`Bot release could not be saved: ${releaseError?.message ?? "Unknown error"}`);
  }

  await supabase
    .from("bot_products")
    .update({ version })
    .eq("id", params.productId);

  return rowToRelease(release as Record<string, unknown>);
}

export async function getProtectedBotDownload(params: {
  accessId: string;
  userId: string;
}): Promise<{ downloadUrl: string; release: BotReleaseDto }> {
  const supabase = createAdminClient();
  const { data: access, error: accessError } = await supabase
    .from("bot_access_records")
    .select("id, product_id, status")
    .eq("id", params.accessId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (accessError) throw new Error(accessError.message);
  if (!access) throw new Error("Bot access record not found.");
  if (access.status !== "ACTIVE") throw new Error("Your access to this bot is not active.");

  const { data: release, error: releaseError } = await supabase
    .from("bot_file_releases")
    .select("*")
    .eq("product_id", access.product_id)
    .eq("status", "PUBLISHED")
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (releaseError) throw new Error(releaseError.message);
  if (!release) throw new Error("No downloadable bot file has been published yet.");

  const releaseDto = rowToRelease(release as Record<string, unknown>);
  const { data: signed, error: signedError } = await supabase.storage
    .from(BOT_FILE_BUCKET)
    .createSignedUrl(release.storage_path as string, 60, {
      download: releaseDto.originalFileName,
    });

  if (signedError || !signed?.signedUrl) {
    throw new Error(`Could not create a protected download: ${signedError?.message ?? "Unknown error"}`);
  }

  return { downloadUrl: signed.signedUrl, release: releaseDto };
}
