import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapRiskRuleToDto, mapRiskEventToDto } from '@/lib/mappers/riskMapper'
import type { RiskRuleDto, RiskEventDto } from '@/lib/domain/types'
import type { UserRole } from '@/lib/auth/rbac'

export async function listRiskRules(
  accountId: string | undefined,
  userId: string,
  role: UserRole
): Promise<RiskRuleDto[]> {
  // Admin bypasses RLS to see all rules; traders see their own via SSR client.
  const supabase = role === 'ADMIN' ? createAdminClient() : await createClient()

  // Platform-level rules (trading_account_id IS NULL) always included for active users
  const { data: platformRules } = await supabase
    .from('risk_rules')
    .select('id, trading_account_id, name, severity, metric, threshold, enabled')
    .is('trading_account_id', null)

  let accountRules: typeof platformRules = []

  if (role === 'ADMIN') {
    const { data } = await supabase
      .from('risk_rules')
      .select('id, trading_account_id, name, severity, metric, threshold, enabled')
      .not('trading_account_id', 'is', null)
    accountRules = data ?? []
  } else if (accountId) {
    const { data } = await supabase
      .from('risk_rules')
      .select('id, trading_account_id, name, severity, metric, threshold, enabled')
      .eq('trading_account_id', accountId)
    accountRules = data ?? []
  }

  const all = [...(platformRules ?? []), ...(accountRules ?? [])]
  return all.map(mapRiskRuleToDto)
}

export async function listRiskEvents(
  accountId: string | undefined,
  userId: string,
  role: UserRole
): Promise<RiskEventDto[]> {
  // Admin bypasses RLS to see all events; traders see their own via SSR client.
  const supabase = role === 'ADMIN' ? createAdminClient() : await createClient()

  let query = supabase
    .from('risk_events')
    .select('id, trading_account_id, rule_name, severity, message, created_at')
    .order('created_at', { ascending: false })

  if (role !== 'ADMIN') {
    // Get user's accounts
    const { data: userAccounts } = await supabase
      .from('trading_accounts')
      .select('id')
      .eq('user_id', userId)
    const ids = (userAccounts ?? []).map(a => a.id)
    if (ids.length === 0) return []
    query = query.in('trading_account_id', ids)
  }

  if (accountId) {
    query = query.eq('trading_account_id', accountId)
  }

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch risk events: ${error.message}`)

  return (data ?? []).map(mapRiskEventToDto)
}

export async function createRiskRule(data: {
  accountId?: string
  name: string
  severity: string
  metric: string
  threshold: number
}): Promise<RiskRuleDto> {
  const supabase = await createClient()

  const { data: rule, error } = await supabase
    .from('risk_rules')
    .insert({
      trading_account_id: data.accountId ?? null,
      name: data.name,
      severity: data.severity,
      metric: data.metric,
      threshold: data.threshold,
      enabled: true,
    })
    .select('id, trading_account_id, name, severity, metric, threshold, enabled')
    .single()

  if (error || !rule) throw new Error(`Failed to create risk rule: ${error?.message}`)
  return mapRiskRuleToDto(rule)
}

export async function updateRiskRule(id: string, data: {
  name?: string
  severity?: string
  threshold?: number
  enabled?: boolean
}): Promise<RiskRuleDto> {
  const supabase = await createClient()

  const { data: rule, error } = await supabase
    .from('risk_rules')
    .update(data)
    .eq('id', id)
    .select('id, trading_account_id, name, severity, metric, threshold, enabled')
    .single()

  if (error || !rule) throw new Error(`Failed to update risk rule: ${error?.message}`)
  return mapRiskRuleToDto(rule)
}

export async function acknowledgeRiskEvent(eventId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('risk_events')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', eventId)
}
