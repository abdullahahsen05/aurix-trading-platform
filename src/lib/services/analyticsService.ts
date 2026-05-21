import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapTradeToDto } from '@/lib/mappers/tradeMapper'
import { buildAnalyticsSummary } from '@/lib/domain/metrics'
import type { AnalyticsSummary, EquityPoint } from '@/lib/domain/types'
import type { UserRole } from '@/lib/auth/rbac'

export async function getAnalyticsSummary(
  accountId: string,
  userId: string,
  role: UserRole
): Promise<AnalyticsSummary> {
  const supabase = role === 'ADMIN' ? createAdminClient() : await createClient()

  // Verify access
  if (role !== 'ADMIN') {
    const { data } = await supabase
      .from('trading_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single()
    if (!data) throw new Error('Account not found or access denied')
  }

  const { data: tradeRows, error: tradeError } = await supabase
    .from('trades')
    .select('id, trading_account_id, symbol, side, status, volume, open_price, close_price, profit, currency, opened_at, closed_at')
    .eq('trading_account_id', accountId)

  if (tradeError) throw new Error(`Failed to fetch trades: ${tradeError.message}`)

  const { data: snapshots, error: snapError } = await supabase
    .from('account_snapshots')
    .select('balance, equity, captured_at')
    .eq('trading_account_id', accountId)
    .order('captured_at', { ascending: true })

  if (snapError) throw new Error(`Failed to fetch snapshots: ${snapError.message}`)

  const trades = (tradeRows ?? []).map(mapTradeToDto)
  const equityCurve: EquityPoint[] = (snapshots ?? []).map(s => ({
    capturedAt: s.captured_at,
    balance: Number(s.balance),
    equity: Number(s.equity),
  }))

  return buildAnalyticsSummary(accountId, trades, equityCurve)
}

export async function getEquityCurve(
  accountId: string,
  userId: string,
  role: UserRole
): Promise<EquityPoint[]> {
  const supabase = role === 'ADMIN' ? createAdminClient() : await createClient()

  if (role !== 'ADMIN') {
    const { data } = await supabase
      .from('trading_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single()
    if (!data) throw new Error('Account not found or access denied')
  }

  const { data: snapshots, error } = await supabase
    .from('account_snapshots')
    .select('balance, equity, captured_at')
    .eq('trading_account_id', accountId)
    .order('captured_at', { ascending: true })

  if (error) throw new Error(`Failed to fetch equity curve: ${error.message}`)

  return (snapshots ?? []).map(s => ({
    capturedAt: s.captured_at,
    balance: Number(s.balance),
    equity: Number(s.equity),
  }))
}
