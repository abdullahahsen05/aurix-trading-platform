import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapTradeToDto } from '@/lib/mappers/tradeMapper'
import type { TradeDto, TradeStatus } from '@/lib/domain/types'
import type { UserRole } from '@/lib/auth/rbac'

export async function listTrades(params: {
  userId: string
  role: UserRole
  accountId?: string
  status?: TradeStatus
}): Promise<TradeDto[]> {
  // Admin bypasses RLS to see all trades; traders see only their own via SSR client.
  const supabase = params.role === 'ADMIN' ? createAdminClient() : await createClient()

  let query = supabase
    .from('trades')
    .select('id, trading_account_id, symbol, side, status, volume, open_price, close_price, profit, currency, opened_at, closed_at')
    .order('opened_at', { ascending: false })

  if (params.accountId) {
    query = query.eq('trading_account_id', params.accountId)
  }
  if (params.status) {
    query = query.eq('status', params.status)
  }

  // If trader, limit to their own accounts
  if (params.role !== 'ADMIN') {
    // Get user's account IDs first
    const { data: userAccounts } = await supabase
      .from('trading_accounts')
      .select('id')
      .eq('user_id', params.userId)

    const accountIds = (userAccounts ?? []).map(a => a.id)
    if (accountIds.length === 0) return []

    query = query.in('trading_account_id', accountIds)
  }

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch trades: ${error.message}`)

  return (data ?? []).map(mapTradeToDto)
}
