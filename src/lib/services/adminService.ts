import { createAdminClient } from '@/lib/supabase/admin'
import type { AdminSummaryDto, TraderAccountSummary } from '@/lib/domain/types'
import { mapAccountToDto } from '@/lib/mappers/accountMapper'

export async function getAdminSummary(): Promise<AdminSummaryDto> {
  const supabase = createAdminClient()

  const [
    { count: activeTraders },
    { count: connectedAccounts },
    { count: openRiskEvents },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'TRADER')
      .eq('status', 'ACTIVE'),
    supabase
      .from('trading_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'CONNECTED'),
    supabase
      .from('risk_events')
      .select('id', { count: 'exact', head: true })
      .is('acknowledged_at', null),
  ])

  // MRR from active subscriptions count (basic estimation)
  const { count: activeSubs } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  const estimatedMRR = (activeSubs ?? 0) * 99

  return {
    activeTraders: activeTraders ?? 0,
    connectedAccounts: connectedAccounts ?? 0,
    openRiskEvents: openRiskEvents ?? 0,
    monthlyRecurringRevenue: { amount: estimatedMRR, currency: 'USD' },
  }
}

export async function listUsers() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, status, created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch users: ${error.message}`)
  return data ?? []
}

export async function updateUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'PENDING') {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('id', userId)

  if (error) throw new Error(`Failed to update user status: ${error.message}`)
}

export async function listAllAccounts(): Promise<TraderAccountSummary[]> {
  const supabase = createAdminClient()

  const { data: accounts, error } = await supabase
    .from('trading_accounts')
    .select('id, account_name, broker_name, status, currency, updated_at, user_id')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch accounts: ${error.message}`)

  const results: TraderAccountSummary[] = []

  for (const account of accounts ?? []) {
    const { data: snapshots } = await supabase
      .from('account_snapshots')
      .select('balance, equity, floating_pnl, drawdown_percent')
      .eq('trading_account_id', account.id)
      .order('captured_at', { ascending: false })
      .limit(1)

    const snapshot = snapshots?.[0] ?? null

    const { count } = await supabase
      .from('trades')
      .select('id', { count: 'exact', head: true })
      .eq('trading_account_id', account.id)
      .eq('status', 'OPEN')

    results.push(mapAccountToDto(account, snapshot, count ?? 0))
  }

  return results
}

export async function listAuditLogs() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, actor_user_id, action, entity_type, entity_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`Failed to fetch audit logs: ${error.message}`)
  return data ?? []
}

// Backwards-compatible alias used by existing API routes
export { listUsers as listAdminUsers }
