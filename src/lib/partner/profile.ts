export type PartnerProfileStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED'

export interface PartnerProfileStatusDto {
  status: PartnerProfileStatus
  setupComplete: boolean
  referralCode: string | null
  commissionPercent: number
}
