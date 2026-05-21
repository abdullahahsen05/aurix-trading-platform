export type UserRole = 'TRADER' | 'ADMIN'
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING'

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
  return role === 'ADMIN'
}

export function isTrader(role: UserRole): boolean {
  return role === 'TRADER'
}

export function isActive(status: UserStatus): boolean {
  return status === 'ACTIVE'
}

export function canAccessAdminRoutes(role: UserRole, status: UserStatus): boolean {
  return role === 'ADMIN' && status === 'ACTIVE'
}

export function canAccessTraderRoutes(role: UserRole, status: UserStatus): boolean {
  return (role === 'TRADER' || role === 'ADMIN') && status === 'ACTIVE'
}
