import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BotProductDto,
  BotAccessRecordDto,
} from "@/lib/domain/types";

function rowToProduct(
  row: Record<string, unknown>,
  includeLegacyDownloadUrl = false,
): BotProductDto {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    shortDescription: (row.short_description as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    features: (row.features as string[]) ?? [],
    platform: row.platform as BotProductDto["platform"],
    status: row.status as BotProductDto["status"],
    priceAmount: row.price_amount != null ? Number(row.price_amount) : null,
    priceCurrency: (row.price_currency as string) ?? "USD",
    pricingLabel: (row.pricing_label as string | null) ?? null,
    difficulty: (row.difficulty as BotProductDto["difficulty"]) ?? null,
    riskLevel: (row.risk_level as BotProductDto["riskLevel"]) ?? null,
    screenshotUrls: (row.screenshot_urls as string[]) ?? [],
    videoUrl: (row.video_url as string | null) ?? null,
    downloadUrl: includeLegacyDownloadUrl
      ? (row.download_url as string | null) ?? null
      : null,
    version: (row.version as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToAccess(row: Record<string, unknown>): BotAccessRecordDto {
  const product = row.bot_products as Record<string, unknown> | null;
  return {
    id: row.id as string,
    productId: row.product_id as string,
    productName: (product?.name as string | null) ?? "",
    productSlug: (product?.slug as string | null) ?? "",
    userId: row.user_id as string,
    status: row.status as BotAccessRecordDto["status"],
    source: row.source as BotAccessRecordDto["source"],
    grantedAt: (row.granted_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    hasPublishedRelease: false,
    releaseVersion: null,
    releaseFileName: null,
    createdAt: row.created_at as string,
  };
}

// ── Public / trader queries ───────────────────────────────────────────────────

export async function listPublishedProducts(): Promise<BotProductDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bot_products")
    .select("*")
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToProduct(r as Record<string, unknown>));
}

export async function getPublishedProductBySlug(
  slug: string
): Promise<BotProductDto | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bot_products")
    .select("*")
    .eq("slug", slug)
    .eq("status", "PUBLISHED")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToProduct(data as Record<string, unknown>);
}

export async function getAccessRecord(
  productId: string,
  userId: string
): Promise<BotAccessRecordDto | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bot_access_records")
    .select("*, bot_products(name, slug)")
    .eq("product_id", productId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToAccess(data as Record<string, unknown>);
}

export async function requestAccess(
  productId: string,
  userId: string
): Promise<BotAccessRecordDto> {
  const supabase = createAdminClient();

  // Idempotent: return existing record if already requested/active
  const existing = await getAccessRecord(productId, userId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("bot_access_records")
    .insert({
      product_id: productId,
      user_id: userId,
      status: "REQUESTED",
      source: "REQUEST",
    })
    .select("*, bot_products(name, slug)")
    .single();
  if (error) throw new Error(error.message);
  return rowToAccess(data as Record<string, unknown>);
}

export async function listUserAccessRecords(
  userId: string
): Promise<BotAccessRecordDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bot_access_records")
    .select("*, bot_products(name, slug)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const records = (data ?? []).map((r) => rowToAccess(r as Record<string, unknown>));
  const productIds = [...new Set(records.map((record) => record.productId))];
  if (productIds.length === 0) return records;

  const { data: releases, error: releaseError } = await supabase
    .from("bot_file_releases")
    .select("product_id, version, original_filename, published_at, created_at")
    .in("product_id", productIds)
    .eq("status", "PUBLISHED")
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });

  // Keep My Bots usable before the release migration has been applied.
  if (releaseError) return records;

  const latestByProduct = new Map<
    string,
    { version: string; original_filename: string }
  >();
  for (const release of releases ?? []) {
    if (!latestByProduct.has(release.product_id as string)) {
      latestByProduct.set(release.product_id as string, {
        version: release.version as string,
        original_filename: release.original_filename as string,
      });
    }
  }

  return records.map((record) => {
    const release = latestByProduct.get(record.productId);
    return {
      ...record,
      hasPublishedRelease: Boolean(release),
      releaseVersion: release?.version ?? null,
      releaseFileName: release?.original_filename ?? null,
    };
  });
}

// ── Admin queries ─────────────────────────────────────────────────────────────

export interface AdminProductInput {
  slug: string;
  name: string;
  shortDescription?: string;
  description?: string;
  features?: string[];
  platform?: BotProductDto["platform"];
  status?: BotProductDto["status"];
  priceAmount?: number | null;
  priceCurrency?: string;
  pricingLabel?: string | null;
  difficulty?: BotProductDto["difficulty"] | null;
  riskLevel?: BotProductDto["riskLevel"] | null;
  screenshotUrls?: string[];
  videoUrl?: string | null;
  version?: string | null;
  createdBy?: string;
}

export async function adminCreateProduct(
  input: AdminProductInput
): Promise<BotProductDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bot_products")
    .insert({
      slug: input.slug,
      name: input.name,
      short_description: input.shortDescription ?? null,
      description: input.description ?? null,
      features: input.features ?? [],
      platform: input.platform ?? "MT5",
      status: input.status ?? "DRAFT",
      price_amount: input.priceAmount ?? null,
      price_currency: input.priceCurrency ?? "USD",
      pricing_label: input.pricingLabel ?? null,
      difficulty: input.difficulty ?? null,
      risk_level: input.riskLevel ?? null,
      screenshot_urls: input.screenshotUrls ?? [],
      video_url: input.videoUrl ?? null,
      download_url: null,
      version: input.version ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToProduct(data as Record<string, unknown>, true);
}

export type AdminProductPatch = Partial<Omit<AdminProductInput, "createdBy">>;

export async function adminUpdateProduct(
  id: string,
  patch: AdminProductPatch
): Promise<BotProductDto> {
  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.slug !== undefined) update.slug = patch.slug;
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.shortDescription !== undefined) update.short_description = patch.shortDescription;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.features !== undefined) update.features = patch.features;
  if (patch.platform !== undefined) update.platform = patch.platform;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.priceAmount !== undefined) update.price_amount = patch.priceAmount;
  if (patch.priceCurrency !== undefined) update.price_currency = patch.priceCurrency;
  if (patch.pricingLabel !== undefined) update.pricing_label = patch.pricingLabel;
  if (patch.difficulty !== undefined) update.difficulty = patch.difficulty;
  if (patch.riskLevel !== undefined) update.risk_level = patch.riskLevel;
  if (patch.screenshotUrls !== undefined) update.screenshot_urls = patch.screenshotUrls;
  if (patch.videoUrl !== undefined) update.video_url = patch.videoUrl;
  if (patch.version !== undefined) update.version = patch.version;

  const { data, error } = await supabase
    .from("bot_products")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToProduct(data as Record<string, unknown>, true);
}

export async function adminListAllProducts(): Promise<BotProductDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bot_products")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToProduct(r as Record<string, unknown>, true));
}

export interface AdminAccessRow {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: BotAccessRecordDto["status"];
  source: BotAccessRecordDto["source"];
  grantedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export async function adminListAccessRequests(): Promise<AdminAccessRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bot_access_records")
    .select("*, bot_products(name, slug)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const userIds = [...new Set(rows.map((row) => row.user_id as string).filter(Boolean))];
  const profileById = new Map<string, { full_name: string | null; email: string | null }>();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    if (profilesError) throw new Error(profilesError.message);
    for (const profile of profiles ?? []) {
      profileById.set(profile.id as string, {
        full_name: (profile.full_name as string | null) ?? null,
        email: (profile.email as string | null) ?? null,
      });
    }
  }

  return rows.map((row) => {
    const product = row.bot_products as Record<string, unknown> | null;
    const profile = profileById.get(row.user_id as string);
    return {
      id: row.id as string,
      productId: row.product_id as string,
      productName: (product?.name as string | null) ?? "",
      productSlug: (product?.slug as string | null) ?? "",
      userId: row.user_id as string,
      userName: profile?.full_name ?? "",
      userEmail: profile?.email ?? "",
      status: row.status as BotAccessRecordDto["status"],
      source: row.source as BotAccessRecordDto["source"],
      grantedAt: (row.granted_at as string | null) ?? null,
      expiresAt: (row.expires_at as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  });
}

export async function adminGrantAccess(
  accessId: string,
  grantedBy: string,
  expiresAt?: string | null
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("bot_access_records")
    .update({
      status: "ACTIVE",
      granted_by: grantedBy,
      granted_at: new Date().toISOString(),
      expires_at: expiresAt ?? null,
    })
    .eq("id", accessId);
  if (error) throw new Error(error.message);
}

export async function adminUpdateAccessStatus(
  accessId: string,
  status: "SUSPENDED" | "REVOKED" | "ACTIVE" | "EXPIRED"
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("bot_access_records")
    .update({ status })
    .eq("id", accessId);
  if (error) throw new Error(error.message);
}

export async function adminGetMarketplaceAnalytics(): Promise<{
  totalProducts: number;
  publishedProducts: number;
  totalRequests: number;
  activeAccess: number;
  totalLicenses: number;
  activeLicenses: number;
  verificationLogs24h: number;
}> {
  const supabase = createAdminClient();

  const [products, access, licenses, verifyLogs] = await Promise.all([
    supabase.from("bot_products").select("status", { count: "exact", head: false }),
    supabase.from("bot_access_records").select("status", { count: "exact", head: false }),
    supabase.from("bot_licenses").select("status", { count: "exact", head: false }),
    supabase
      .from("bot_license_verification_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
  ]);

  const productRows = (products.data ?? []) as Array<{ status: string }>;
  const accessRows = (access.data ?? []) as Array<{ status: string }>;
  const licenseRows = (licenses.data ?? []) as Array<{ status: string }>;

  return {
    totalProducts: productRows.length,
    publishedProducts: productRows.filter((r) => r.status === "PUBLISHED").length,
    totalRequests: accessRows.length,
    activeAccess: accessRows.filter((r) => r.status === "ACTIVE").length,
    totalLicenses: licenseRows.length,
    activeLicenses: licenseRows.filter((r) => r.status === "ACTIVE").length,
    verificationLogs24h: verifyLogs.count ?? 0,
  };
}
