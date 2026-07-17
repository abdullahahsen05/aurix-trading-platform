import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/auditService";
import { generateReferralCode } from "@/lib/partner/referral";
import {
  PARTNER_ERROR,
  PartnerError,
  type PartnerCommissionDto,
  type PartnerListItemDto,
} from "@/lib/partner/types";
import { isAdmin, type UserRole } from "@/lib/auth/rbac";

// ─────────────────────────────────────────────────────────────────────────────
// Partner Admin Service (server-only) — admin-gated partner management.
// All callers must be behind requireAdmin().
// ─────────────────────────────────────────────────────────────────────────────

/** List all PARTNER users with their referral code, commission %, and assigned-trader count. */
export async function listPartners(): Promise<PartnerListItemDto[]> {
  const supabase = createAdminClient();

  const { data: partners, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, status")
    .eq("role", "PARTNER")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Failed to fetch partners: ${error.message}`);

  const partnerIds = (partners ?? []).map((p) => p.id);
  if (partnerIds.length === 0) return [];

  const [{ data: pps }, { data: assignedCounts }] = await Promise.all([
    supabase
      .from("partner_profiles")
      .select("user_id, referral_code, commission_percent, status")
      .in("user_id", partnerIds),
    supabase
      .from("trader_profiles")
      .select("partner_id")
      .in("partner_id", partnerIds),
  ]);

  const ppMap = new Map((pps ?? []).map((p) => [p.user_id, p]));
  const countMap = new Map<string, number>();
  for (const row of assignedCounts ?? []) {
    if (row.partner_id) countMap.set(row.partner_id, (countMap.get(row.partner_id) ?? 0) + 1);
  }

  return (partners ?? []).map((p) => {
    const pp = ppMap.get(p.id);
    return {
      userId: p.id,
      name: (p.full_name as string) || (p.email as string),
      email: p.email as string,
      status: p.status as string,
      partnerStatus: ((pp?.status as string) ?? "PENDING_REVIEW") as "PENDING_REVIEW" | "ACTIVE" | "SUSPENDED",
      referralCode: (pp?.referral_code as string) ?? "",
      commissionPercent: pp ? Number(pp.commission_percent) : 0,
      assignedTraders: countMap.get(p.id) ?? 0,
    };
  });
}

/** Ensure a partner_profiles row exists for a user, generating a unique referral code. */
async function ensurePartnerProfile(userId: string, seed: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("partner_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode(seed);
    const { error } = await supabase
      .from("partner_profiles")
      .insert({ user_id: userId, referral_code: code });
    if (!error) return;
    // 23505 = unique_violation (referral_code collision) → retry with a new code
    if ((error as { code?: string }).code !== "23505") {
      throw new Error(`Failed to create partner profile: ${error.message}`);
    }
  }
  throw new Error("Failed to generate a unique referral code");
}

/** Change a user's role. Promoting to PARTNER provisions a partner_profiles row. */
export async function setUserRole(
  userId: string,
  role: UserRole,
  actorUserId: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throw new Error(`Failed to load user: ${pErr.message}`);
  if (!profile) throw new PartnerError(PARTNER_ERROR.TRADER_NOT_FOUND, "User not found", 404);

  const { error: roleErr } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (roleErr) throw new Error(`Failed to update role: ${roleErr.message}`);

  if (role === "PARTNER") {
    await ensurePartnerProfile(userId, (profile.full_name as string) || (profile.email as string));
    // A partner is not a trader — remove their trader_profile so they don't
    // appear in trader/CRM lists (mirrors how admins are handled).
    await supabase.from("trader_profiles").delete().eq("user_id", userId);
  } else if (role === "TRADER") {
    // Ensure a trader_profile exists (signup trigger normally creates it).
    await supabase.from("trader_profiles").upsert({ user_id: userId }, { onConflict: "user_id" });
  } else if (isAdmin(role)) {
    await supabase.from("trader_profiles").delete().eq("user_id", userId);
  }

  await writeAuditLog({
    actorUserId,
    action: "USER_ROLE_CHANGED",
    entityType: "profile",
    entityId: userId,
    metadata: { from: profile.role, to: role },
  });
}

/** Assign (or, with null, unassign) a trader to a partner. */
export async function assignTraderToPartner(
  traderUserId: string,
  partnerId: string | null,
  actorUserId: string,
): Promise<void> {
  const supabase = createAdminClient();

  // Trader must be a TRADER.
  const { data: trader } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", traderUserId)
    .maybeSingle();
  if (!trader) throw new PartnerError(PARTNER_ERROR.TRADER_NOT_FOUND, "Trader not found", 404);
  if (trader.role !== "TRADER") {
    throw new PartnerError(PARTNER_ERROR.VALIDATION_ERROR, "Target user is not a trader", 400);
  }

  // Partner (when assigning) must be a PARTNER.
  if (partnerId !== null) {
    const { data: partner } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", partnerId)
      .maybeSingle();
    if (!partner) throw new PartnerError(PARTNER_ERROR.PARTNER_NOT_FOUND, "Partner not found", 404);
    if (partner.role !== "PARTNER") {
      throw new PartnerError(PARTNER_ERROR.INVALID_PARTNER_ROLE, "Target user is not a partner", 400);
    }
  }

  const { error } = await supabase
    .from("trader_profiles")
    .update({
      partner_id: partnerId,
      partner_assigned_at: partnerId ? new Date().toISOString() : null,
    })
    .eq("user_id", traderUserId);
  if (error) throw new Error(`Failed to assign partner: ${error.message}`);

  await writeAuditLog({
    actorUserId,
    action: partnerId ? "PARTNER_ASSIGNED" : "PARTNER_UNASSIGNED",
    entityType: "trader_profile",
    entityId: traderUserId,
    metadata: { partnerId },
  });
}

// ── Admin commission management ──────────────────────────────────────────────

function mapCommissionRow(r: {
  id: string;
  trader_id: string | null;
  source_type: string;
  gross_amount: number | string;
  commission_percent: number | string;
  commission_amount: number | string;
  currency: string;
  status: PartnerCommissionDto["status"];
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  paid_at: string | null;
  profiles?: { full_name?: string } | null;
}): PartnerCommissionDto {
  return {
    id: r.id,
    traderId: r.trader_id,
    traderName: r.profiles?.full_name ?? null,
    sourceType: r.source_type,
    grossAmount: Number(r.gross_amount),
    commissionPercent: Number(r.commission_percent),
    commissionAmount: Number(r.commission_amount),
    currency: r.currency,
    status: r.status,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  };
}

export async function listCommissionsForPartner(partnerId: string): Promise<PartnerCommissionDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("partner_commissions")
    .select(
      "id, trader_id, source_type, gross_amount, commission_percent, commission_amount, currency, status, period_start, period_end, created_at, paid_at, profiles!trader_id(full_name)",
    )
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Failed to fetch commissions: ${error.message}`);
  return (data ?? []).map((r) => mapCommissionRow(r as Parameters<typeof mapCommissionRow>[0]));
}

export async function createCommissionRecord(
  partnerId: string,
  input: {
    traderId?: string | null;
    sourceType: string;
    grossAmount: number;
    commissionPercent: number;
    commissionAmount: number;
    currency: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    note?: string;
  },
  actorUserId: string,
): Promise<PartnerCommissionDto> {
  const supabase = createAdminClient();

  // Partner must exist and be a PARTNER.
  const { data: partner } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner) throw new PartnerError(PARTNER_ERROR.PARTNER_NOT_FOUND, "Partner not found", 404);
  if (partner.role !== "PARTNER") {
    throw new PartnerError(PARTNER_ERROR.INVALID_PARTNER_ROLE, "Target user is not a partner", 400);
  }

  const { data, error } = await supabase
    .from("partner_commissions")
    .insert({
      partner_id: partnerId,
      trader_id: input.traderId ?? null,
      source_type: input.sourceType,
      gross_amount: input.grossAmount,
      commission_percent: input.commissionPercent,
      commission_amount: input.commissionAmount,
      currency: input.currency,
      status: "PENDING",
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
      metadata: input.note ? { note: input.note } : null,
    })
    .select(
      "id, trader_id, source_type, gross_amount, commission_percent, commission_amount, currency, status, period_start, period_end, created_at, paid_at, profiles!trader_id(full_name)",
    )
    .single();
  if (error || !data) throw new Error(`Failed to create commission: ${error?.message}`);

  await writeAuditLog({
    actorUserId,
    action: "PARTNER_COMMISSION_CREATED",
    entityType: "partner_commission",
    entityId: data.id,
    metadata: { partnerId, amount: input.commissionAmount, currency: input.currency },
  });
  return mapCommissionRow(data as Parameters<typeof mapCommissionRow>[0]);
}

export async function updateCommissionStatus(
  commissionId: string,
  status: "PENDING" | "APPROVED" | "PAID" | "CANCELLED",
  actorUserId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = { status };
  if (status === "PAID") patch.paid_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("partner_commissions")
    .update(patch)
    .eq("id", commissionId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Failed to update commission: ${error.message}`);
  if (!data) throw new PartnerError(PARTNER_ERROR.COMMISSION_NOT_FOUND, "Commission not found", 404);

  await writeAuditLog({
    actorUserId,
    action: "PARTNER_COMMISSION_STATUS_CHANGED",
    entityType: "partner_commission",
    entityId: commissionId,
    metadata: { status },
  });
}

// ── Partner application approval / rejection ─────────────────────────────────

export async function approvePartner(partnerId: string, actorUserId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("partner_profiles")
    .update({ status: "ACTIVE" })
    .eq("user_id", partnerId)
    .select("user_id")
    .maybeSingle();
  if (error) throw new Error(`Failed to approve partner: ${error.message}`);
  if (!data) throw new PartnerError(PARTNER_ERROR.PARTNER_NOT_FOUND, "Partner profile not found", 404);

  await writeAuditLog({
    actorUserId,
    action: "PARTNER_APPROVED",
    entityType: "partner_profile",
    entityId: partnerId,
    metadata: {},
  });
}

export async function rejectPartner(partnerId: string, actorUserId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("partner_profiles")
    .update({ status: "SUSPENDED" })
    .eq("user_id", partnerId)
    .select("user_id")
    .maybeSingle();
  if (error) throw new Error(`Failed to reject partner: ${error.message}`);
  if (!data) throw new PartnerError(PARTNER_ERROR.PARTNER_NOT_FOUND, "Partner profile not found", 404);

  await writeAuditLog({
    actorUserId,
    action: "PARTNER_REJECTED",
    entityType: "partner_profile",
    entityId: partnerId,
    metadata: {},
  });
}

// ── Referral claim (called right after a trader signs up via a referral link) ─

export async function claimReferral(traderUserId: string, code: string): Promise<boolean> {
  const supabase = createAdminClient();

  const normalized = code.trim().toUpperCase();
  const { data: partner } = await supabase
    .from("partner_profiles")
    .select("user_id, status")
    .eq("referral_code", normalized)
    .maybeSingle();
  if (!partner || partner.status !== "ACTIVE") return false; // invalid code → ignore silently

  // Only assign if the new user is a TRADER and not already attributed.
  const { data: tp } = await supabase
    .from("trader_profiles")
    .select("user_id, partner_id")
    .eq("user_id", traderUserId)
    .maybeSingle();
  if (!tp || tp.partner_id) return false;

  const { error } = await supabase
    .from("trader_profiles")
    .update({ partner_id: partner.user_id, partner_assigned_at: new Date().toISOString() })
    .eq("user_id", traderUserId);
  if (error) return false;

  await writeAuditLog({
    actorUserId: null,
    action: "PARTNER_ASSIGNED",
    entityType: "trader_profile",
    entityId: traderUserId,
    metadata: { partnerId: partner.user_id, via: "referral" },
  });
  return true;
}

export async function validateReferralCode(code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  if (normalized.length < 2 || normalized.length > 40) return false;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("partner_profiles")
    .select("user_id")
    .eq("referral_code", normalized)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error) throw new Error(`Failed to validate referral code: ${error.message}`);
  return Boolean(data);
}
