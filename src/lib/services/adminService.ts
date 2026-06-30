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
    .select('id, email, full_name, role, status, created_at, trader_profiles!user_id(partner_id)')
    .order('created_at', { ascending: false })
    .limit(200)

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
    .limit(500)

  if (error) throw new Error(`Failed to fetch accounts: ${error.message}`)

  const accountIds = (accounts ?? []).map(account => account.id)
  if (accountIds.length === 0) return []

  const [
    { data: snapshots, error: snapshotError },
    { data: counts, error: countError },
  ] = await Promise.all([
    supabase
      .from('latest_account_snapshots')
      .select('trading_account_id, balance, equity, floating_pnl, drawdown_percent')
      .in('trading_account_id', accountIds),
    supabase
      .from('account_open_trade_counts')
      .select('trading_account_id, open_trade_count')
      .in('trading_account_id', accountIds),
  ])

  if (snapshotError) throw new Error(`Failed to fetch latest account snapshots: ${snapshotError.message}`)
  if (countError) throw new Error(`Failed to fetch open trade counts: ${countError.message}`)

  const snapshotMap = new Map(
    (snapshots ?? []).map(snapshot => [snapshot.trading_account_id, snapshot])
  )
  const countMap = new Map(
    (counts ?? []).map(count => [count.trading_account_id, count.open_trade_count as number])
  )

  return accounts.map(account =>
    mapAccountToDto(
      account,
      snapshotMap.get(account.id) ?? null,
      countMap.get(account.id) ?? 0,
    )
  )
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
