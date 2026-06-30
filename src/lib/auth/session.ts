import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/auth/rbac'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: UserRole
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'
}

/**
 * Get current authenticated user from Supabase session.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const supabase = await createClient()

    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, status')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) return null

    return {
      id: profile.id,
      email: profile.email,
      name: profile.full_name,
      role: profile.role as UserRole,
      status: profile.status as 'ACTIVE' | 'SUSPENDED' | 'PENDING',
    }
  } catch {
    return null
  }
}

/**
 * Require authentication - throws if not authenticated.
 * Use in API route handlers.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) {
    throw new AuthError('UNAUTHORIZED', 'Not authenticated', 401)
  }
  if (user.status === 'SUSPENDED') {
    throw new AuthError('SUSPENDED', 'Account suspended', 403)
  }
  return user
}

/**
 * Require ADMIN role.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth()
  if (user.role !== 'ADMIN') {
    throw new AuthError('FORBIDDEN', 'Admin access required', 403)
  }
  return user
}

/**
 * Require TRADER role (or admin, since admins can preview trader data).
 */
export async function requireTrader(): Promise<SessionUser> {
  const user = await requireAuth()
  if (user.role !== 'TRADER' && user.role !== 'ADMIN') {
    throw new AuthError('FORBIDDEN', 'Trader access required', 403)
  }
  return user
}

/**
 * Require PARTNER role.
 */
export async function requirePartner(): Promise<SessionUser> {
  const user = await requireAuth()
  if (user.role !== 'PARTNER') {
    throw new AuthError('FORBIDDEN', 'Partner access required', 403)
  }
  return user
}

/**
 * Get role of current user without throwing.
 */
export async function getUserRole(): Promise<UserRole | null> {
  const user = await getCurrentUser()
  return user?.role ?? null
}

/**
 * Assert that the current user can access a specific trading account.
 * Admins can access any account. Traders can only access their own.
 */
export async function assertCanAccessAccount(accountId: string): Promise<SessionUser> {
  const user = await requireAuth()

  if (user.role === 'ADMIN') return user

  // Verify the account belongs to this user
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trading_accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    throw new AuthError('FORBIDDEN', 'You do not have access to this account', 403)
  }

  return user
}

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 401
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
