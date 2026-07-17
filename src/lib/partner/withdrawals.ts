export const MINIMUM_PARTNER_WITHDRAWAL = 100;

export type PartnerWithdrawalStatus = "PENDING_REVIEW" | "APPROVED" | "PAID" | "REJECTED";

export interface PartnerWithdrawalDto {
  id: string;
  partnerId: string;
  partnerName?: string;
  partnerEmail?: string;
  amount: number;
  currency: string;
  status: PartnerWithdrawalStatus;
  payoutMethod: string;
  payoutReference: string;
  requestedNote: string | null;
  adminNote: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerWithdrawalBalanceDto {
  approved: number;
  reserved: number;
  available: number;
  currency: string;
  minimum: number;
}

export function calculateWithdrawalBalance(
  approvedAmounts: number[],
  reservedOrPaidAllocations: number[],
  currency = "USD",
): PartnerWithdrawalBalanceDto {
  const approved = approvedAmounts.reduce((sum, amount) => sum + Number(amount || 0), 0);
  const reserved = reservedOrPaidAllocations.reduce((sum, amount) => sum + Number(amount || 0), 0);
  return {
    approved: Number(approved.toFixed(2)),
    reserved: Number(reserved.toFixed(2)),
    available: Number(Math.max(0, approved - reserved).toFixed(2)),
    currency,
    minimum: MINIMUM_PARTNER_WITHDRAWAL,
  };
}

export function validateWithdrawalTransition(
  current: PartnerWithdrawalStatus,
  next: PartnerWithdrawalStatus,
): boolean {
  if (current === "PENDING_REVIEW") return next === "APPROVED" || next === "REJECTED";
  if (current === "APPROVED") return next === "PAID" || next === "REJECTED";
  return false;
}
