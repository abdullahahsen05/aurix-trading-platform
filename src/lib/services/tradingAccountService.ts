import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapAccountToDto } from '@/lib/mappers/accountMapper'
import type { TraderAccountSummary } from '@/lib/domain/types'
import type { UserRole } from '@/lib/auth/rbac'

export async function listTradingAccounts(userId: string, role: UserRole): Promise<TraderAccountSummary[]> {
  // Admin bypasses RLS to see all accounts; traders see only their own via SSR client.
  const supabase = role === 'ADMIN' ? createAdminClient() : await createClient()

  let query = supabase
    .from('trading_accounts')
    .select('id, account_name, broker_name, status, currency, updated_at, user_id')
    .order('created_at', { ascending: false })

  if (role !== 'ADMIN') {
    query = query.eq('user_id', userId)
  }

  const { data: accounts, error } = await query
  if (error) throw new Error(`Failed to fetch trading accounts: ${error.message}`)

  const results: TraderAccountSummary[] = []

  for (const account of accounts ?? []) {
    // Get latest snapshot
    const { data: snapshots } = await supabase
      .from('account_snapshots')
      .select('balance, equity, floating_pnl, drawdown_percent')
      .eq('trading_account_id', account.id)
      .order('captured_at', { ascending: false })
      .limit(1)

    const snapshot = snapshots?.[0] ?? null

    // Count open trades
    const { count } = await supabase
      .from('trades')
      .select('id', { count: 'exact', head: true })
      .eq('trading_account_id', account.id)
      .eq('status', 'OPEN')

    results.push(mapAccountToDto(account, snapshot, count ?? 0))
  }

  return results
}

export async function getTradingAccount(
  accountId: string,
  userId: string,
  role: UserRole
): Promise<TraderAccountSummary | null> {
  const supabase = role === 'ADMIN' ? createAdminClient() : await createClient()

  let query = supabase
    .from('trading_accounts')
    .select('id, account_name, broker_name, status, currency, updated_at, user_id')
    .eq('id', accountId)

  if (role !== 'ADMIN') {
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query.single()
  if (error || !data) return null

  const { data: snapshots } = await supabase
    .from('account_snapshots')
    .select('balance, equity, floating_pnl, drawdown_percent')
    .eq('trading_account_id', accountId)
    .order('captured_at', { ascending: false })
    .limit(1)

  const { count } = await supabase
    .from('trades')
    .select('id', { count: 'exact', head: true })
    .eq('trading_account_id', accountId)
    .eq('status', 'OPEN')

  return mapAccountToDto(data, snapshots?.[0] ?? null, count ?? 0)
}

export async function createTradingAccount(userId: string, data: {
  accountName: string
  brokerName: string
  brokerAccountId?: string
  currency?: string
}): Promise<TraderAccountSummary> {
  const supabase = await createClient()

  const { data: account, error } = await supabase
    .from('trading_accounts')
    .insert({
      user_id: userId,
      account_name: data.accountName,
      broker_name: data.brokerName,
      broker_account_id: data.brokerAccountId ?? null,
      currency: data.currency ?? 'USD',
      status: 'PENDING',
    })
    .select('id, account_name, broker_name, status, currency, updated_at, user_id')
    .single()

  if (error || !account) throw new Error(`Failed to create account: ${error?.message}`)

  return mapAccountToDto(account, null, 0)
}
