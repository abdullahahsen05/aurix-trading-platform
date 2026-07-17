export type UserRole = 'TRADER' | 'PARTNER' | 'ADMIN' | 'SUPER_ADMIN'
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING'

const USER_ROLES = new Set<UserRole>(['TRADER', 'PARTNER', 'ADMIN', 'SUPER_ADMIN'])

export function parseUserRole(value: unknown): UserRole | null {
  return typeof value === 'string' && USER_ROLES.has(value as UserRole)
    ? (value as UserRole)
    : null
}

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: UserRole
  status: UserStatus
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export function isAdmin(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

export function isTrader(role: UserRole): boolean {
  return role === 'TRADER'
}

export function isPartner(role: UserRole): boolean {
  return role === 'PARTNER'
}

export function isActive(status: UserStatus): boolean {
  return status === 'ACTIVE'
}

export function canAccessAdminRoutes(role: UserRole, status: UserStatus): boolean {
  return isAdmin(role) && status === 'ACTIVE'
}

export function canAccessTraderRoutes(role: UserRole, status: UserStatus): boolean {
  return (role === 'TRADER' || isAdmin(role)) && status === 'ACTIVE'
}

export function canAccessPartnerRoutes(role: UserRole, status: UserStatus): boolean {
  return role === 'PARTNER' && status === 'ACTIVE'
}
