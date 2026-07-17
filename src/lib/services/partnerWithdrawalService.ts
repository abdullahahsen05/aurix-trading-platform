import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/services/notificationService";
import { writeAuditLog } from "@/lib/services/auditService";
import {
  calculateWithdrawalBalance,
  MINIMUM_PARTNER_WITHDRAWAL,
  type PartnerWithdrawalBalanceDto,
  type PartnerWithdrawalDto,
  type PartnerWithdrawalStatus,
  validateWithdrawalTransition,
} from "@/lib/partner/withdrawals";

type WithdrawalRow = {
  id: string;
  partner_id: string;
  amount: number | string;
  currency: string;
  status: PartnerWithdrawalStatus;
  payout_method: string;
  payout_reference: string;
  requested_note: string | null;
  admin_note: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  partner?: { full_name?: string | null; email?: string | null } | null;
};

function mapWithdrawal(row: WithdrawalRow): PartnerWithdrawalDto {
  return {
    id: row.id,
    partnerId: row.partner_id,
    partnerName: row.partner?.full_name ?? undefined,
    partnerEmail: row.partner?.email ?? undefined,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    payoutMethod: row.payout_method,
    payoutReference: row.payout_reference,
    requestedNote: row.requested_note,
    adminNote: row.admin_note,
    rejectionReason: row.rejection_reason,
    reviewedAt: row.reviewed_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getAllocationUsage(partnerId: string, currency: string): Promise<Map<string, number>> {
  const supabase = createAdminClient();
  const { data: requests, error: requestError } = await supabase
    .from("partner_withdrawal_requests")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("currency", currency)
    .in("status", ["PENDING_REVIEW", "APPROVED", "PAID"]);
  if (requestError) throw new Error(`Failed to load withdrawal reservations: ${requestError.message}`);
  const requestIds = (requests ?? []).map((row) => row.id);
  const used = new Map<string, number>();
  if (requestIds.length === 0) return used;

  const { data: allocations, error } = await supabase
    .from("partner_withdrawal_allocations")
    .select("commission_id, allocated_amount")
    .in("withdrawal_request_id", requestIds);
  if (error) throw new Error(`Failed to load withdrawal allocations: ${error.message}`);
  for (const allocation of allocations ?? []) {
    used.set(
      allocation.commission_id,
      (used.get(allocation.commission_id) ?? 0) + Number(allocation.allocated_amount),
    );
  }
  return used;
}

export async function getPartnerWithdrawalBalance(
  partnerId: string,
  currency = "USD",
): Promise<PartnerWithdrawalBalanceDto> {
  const supabase = createAdminClient();
  const { data: commissions, error } = await supabase
    .from("partner_commissions")
    .select("id, commission_amount")
    .eq("partner_id", partnerId)
    .eq("currency", currency)
    .eq("status", "APPROVED");
  if (error) throw new Error(`Failed to load approved commissions: ${error.message}`);
  const used = await getAllocationUsage(partnerId, currency);
  const reserved = (commissions ?? []).map((commission) => used.get(commission.id) ?? 0);
  return calculateWithdrawalBalance(
    (commissions ?? []).map((commission) => Number(commission.commission_amount)),
    reserved,
    currency,
  );
}

export async function listPartnerWithdrawals(partnerId: string): Promise<PartnerWithdrawalDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("partner_withdrawal_requests")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Failed to load withdrawals: ${error.message}`);
  return (data ?? []).map((row) => mapWithdrawal(row as WithdrawalRow));
}

export async function getPartnerWithdrawal(
  partnerId: string,
  withdrawalId: string,
): Promise<PartnerWithdrawalDto | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("partner_withdrawal_requests")
    .select("*")
    .eq("id", withdrawalId)
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load withdrawal: ${error.message}`);
  return data ? mapWithdrawal(data as WithdrawalRow) : null;
}

export async function createPartnerWithdrawal(params: {
  partnerId: string;
  amount: number;
  currency: string;
  payoutMethod: string;
  payoutReference: string;
  requestedNote?: string | null;
}): Promise<PartnerWithdrawalDto> {
  const supabase = createAdminClient();
  const currency = params.currency.trim().toUpperCase();
  const amount = Number(params.amount.toFixed(2));
  if (!Number.isFinite(amount) || amount < MINIMUM_PARTNER_WITHDRAWAL) {
    throw new Error(`Minimum withdrawal is ${MINIMUM_PARTNER_WITHDRAWAL} ${currency}.`);
  }

  const { data: profile } = await supabase
    .from("partner_profiles")
    .select("status")
    .eq("user_id", params.partnerId)
    .maybeSingle();
  if (profile?.status !== "ACTIVE") throw new Error("Only active partners can request withdrawals.");

  const { data: active } = await supabase
    .from("partner_withdrawal_requests")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("currency", currency)
    .in("status", ["PENDING_REVIEW", "APPROVED"])
    .limit(1);
  if (active?.length) throw new Error("You already have an active withdrawal request in this currency.");

  const { data: commissions, error: commissionError } = await supabase
    .from("partner_commissions")
    .select("id, commission_amount, created_at")
    .eq("partner_id", params.partnerId)
    .eq("currency", currency)
    .eq("status", "APPROVED")
    .order("created_at", { ascending: true });
  if (commissionError) throw new Error(`Failed to load approved commissions: ${commissionError.message}`);
  const used = await getAllocationUsage(params.partnerId, currency);
  const available = (commissions ?? []).reduce(
    (sum, commission) => sum + Math.max(0, Number(commission.commission_amount) - (used.get(commission.id) ?? 0)),
    0,
  );
  if (amount > available + 0.001) throw new Error("Withdrawal amount exceeds your available approved balance.");

  const { data: request, error: insertError } = await supabase
    .from("partner_withdrawal_requests")
    .insert({
      partner_id: params.partnerId,
      amount,
      currency,
      payout_method: params.payoutMethod.trim(),
      payout_reference: params.payoutReference.trim(),
      requested_note: params.requestedNote?.trim() || null,
    })
    .select("*")
    .single();
  if (insertError || !request) {
    if (insertError?.code === "23505") throw new Error("You already have an active withdrawal request.");
    throw new Error(`Failed to create withdrawal request: ${insertError?.message}`);
  }

  let remaining = amount;
  const allocations: Array<{ withdrawal_request_id: string; commission_id: string; allocated_amount: number }> = [];
  for (const commission of commissions ?? []) {
    if (remaining <= 0) break;
    const commissionAvailable = Math.max(0, Number(commission.commission_amount) - (used.get(commission.id) ?? 0));
    const allocated = Math.min(remaining, commissionAvailable);
    if (allocated > 0) {
      allocations.push({ withdrawal_request_id: request.id, commission_id: commission.id, allocated_amount: Number(allocated.toFixed(2)) });
      remaining = Number((remaining - allocated).toFixed(2));
    }
  }
  const { error: allocationError } = await supabase.from("partner_withdrawal_allocations").insert(allocations);
  if (allocationError || remaining > 0.001) {
    await supabase.from("partner_withdrawal_requests").delete().eq("id", request.id);
    throw new Error("Withdrawal balance changed while the request was being created. Please retry.");
  }

  void createNotification({
    userId: params.partnerId,
    type: "PARTNER_WITHDRAWAL",
    title: "Withdrawal request submitted",
    message: `Your ${amount.toFixed(2)} ${currency} withdrawal is pending admin review.`,
  }).catch(() => { /* notification delivery must not roll back a valid request */ });
  await writeAuditLog({ actorUserId: params.partnerId, action: "PARTNER_WITHDRAWAL_REQUESTED", entityType: "partner_withdrawal", entityId: request.id, metadata: { amount, currency } });
  return mapWithdrawal(request as WithdrawalRow);
}

export async function listAdminWithdrawals(status?: PartnerWithdrawalStatus): Promise<PartnerWithdrawalDto[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("partner_withdrawal_requests")
    .select("*, partner:profiles!partner_id(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(250);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load withdrawal requests: ${error.message}`);
  return (data ?? []).map((row) => mapWithdrawal(row as unknown as WithdrawalRow));
}

export async function transitionPartnerWithdrawal(params: {
  withdrawalId: string;
  adminId: string;
  nextStatus: "APPROVED" | "PAID" | "REJECTED";
  adminNote?: string | null;
  rejectionReason?: string | null;
}): Promise<PartnerWithdrawalDto> {
  const supabase = createAdminClient();
  const { data: current, error: loadError } = await supabase
    .from("partner_withdrawal_requests")
    .select("*")
    .eq("id", params.withdrawalId)
    .maybeSingle();
  if (loadError || !current) throw new Error("Withdrawal request not found.");
  if (!validateWithdrawalTransition(current.status as PartnerWithdrawalStatus, params.nextStatus)) {
    throw new Error(`Cannot move a ${current.status} withdrawal to ${params.nextStatus}.`);
  }
  if (params.nextStatus === "REJECTED" && (!params.rejectionReason || params.rejectionReason.trim().length < 3)) {
    throw new Error("A rejection reason is required.");
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: params.nextStatus,
    reviewed_by: params.adminId,
    reviewed_at: now,
    admin_note: params.adminNote?.trim() || null,
    rejection_reason: params.nextStatus === "REJECTED" ? params.rejectionReason?.trim() : null,
  };
  if (params.nextStatus === "PAID") patch.paid_at = now;
  const { data: updated, error } = await supabase
    .from("partner_withdrawal_requests")
    .update(patch)
    .eq("id", params.withdrawalId)
    .eq("status", current.status)
    .select("*")
    .maybeSingle();
  if (error || !updated) throw new Error("Withdrawal status changed before this action completed. Refresh and retry.");

  if (params.nextStatus === "PAID") {
    const { data: allocations } = await supabase
      .from("partner_withdrawal_allocations")
      .select("commission_id")
      .eq("withdrawal_request_id", params.withdrawalId);
    const commissionIds = [...new Set((allocations ?? []).map((allocation) => allocation.commission_id))];
    for (const commissionId of commissionIds) {
      const { data: commission } = await supabase
        .from("partner_commissions")
        .select("commission_amount")
        .eq("id", commissionId)
        .maybeSingle();
      const { data: allAllocations } = await supabase
        .from("partner_withdrawal_allocations")
        .select("allocated_amount, withdrawal_request_id")
        .eq("commission_id", commissionId);
      const requestIds = (allAllocations ?? []).map((allocation) => allocation.withdrawal_request_id);
      const { data: paidRequests } = requestIds.length
        ? await supabase.from("partner_withdrawal_requests").select("id").in("id", requestIds).eq("status", "PAID")
        : { data: [] };
      const paidIds = new Set((paidRequests ?? []).map((request) => request.id));
      const reconciled = (allAllocations ?? []).reduce(
        (sum, allocation) => sum + (paidIds.has(allocation.withdrawal_request_id) ? Number(allocation.allocated_amount) : 0),
        0,
      );
      if (commission && reconciled + 0.001 >= Number(commission.commission_amount)) {
        await supabase.from("partner_commissions").update({ status: "PAID", paid_at: now }).eq("id", commissionId);
      }
    }
  }

  const message = params.nextStatus === "APPROVED"
    ? `Your ${Number(current.amount).toFixed(2)} ${current.currency} withdrawal was approved.`
    : params.nextStatus === "PAID"
      ? `Your ${Number(current.amount).toFixed(2)} ${current.currency} withdrawal was marked paid.`
      : `Your withdrawal was rejected: ${params.rejectionReason?.trim()}`;
  void createNotification({ userId: current.partner_id, type: "PARTNER_WITHDRAWAL", title: `Withdrawal ${params.nextStatus.toLowerCase()}`, message })
    .catch(() => { /* workflow state is authoritative even if notification delivery fails */ });
  await writeAuditLog({ actorUserId: params.adminId, action: `PARTNER_WITHDRAWAL_${params.nextStatus}`, entityType: "partner_withdrawal", entityId: params.withdrawalId, metadata: { partnerId: current.partner_id, amount: current.amount, currency: current.currency } });
  return mapWithdrawal(updated as WithdrawalRow);
}
