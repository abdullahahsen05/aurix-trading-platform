import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapRiskRuleToDto, mapRiskEventToDto } from '@/lib/mappers/riskMapper'
import { writeAuditLog } from '@/lib/services/auditService'
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
    .is('acknowledged_at', null)
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
  // Use admin client — this function is only called from admin-gated routes.
  // The RLS policy risk_rules_admin_insert requires is_admin() which correctly
  // gates the SSR client; the admin client bypasses RLS but is only reachable
  // from server-side admin API routes.
  const supabase = createAdminClient()

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
  const supabase = createAdminClient()

  const { data: rule, error } = await supabase
    .from('risk_rules')
    .update(data)
    .eq('id', id)
    .select('id, trading_account_id, name, severity, metric, threshold, enabled')
    .single()

  if (error || !rule) throw new Error(`Failed to update risk rule: ${error?.message}`)
  return mapRiskRuleToDto(rule)
}

export async function acknowledgeRiskEvent(eventId: string, adminUserId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('risk_events')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', eventId)
  if (error) throw new Error(`Failed to acknowledge risk event: ${error.message}`)
  void writeAuditLog({
    actorUserId: adminUserId,
    action: 'RISK_EVENT_ACKNOWLEDGED',
    entityType: 'risk_event',
    entityId: eventId,
    metadata: { eventId },
  })
}

export async function createRiskEvent(data: {
  accountId: string
  ruleName: string
  severity: string
  message: string
}): Promise<string> {
  const supabase = createAdminClient()
  const { data: row, error } = await supabase
    .from('risk_events')
    .insert({
      trading_account_id: data.accountId,
      rule_name: data.ruleName,
      severity: data.severity,
      message: data.message,
    })
    .select('id')
    .single()
  if (error || !row) throw new Error(`Failed to create risk event: ${error?.message}`)
  return row.id
}

export async function findActiveRiskEvent(
  accountId: string,
  ruleName: string
): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('risk_events')
    .select('id')
    .eq('trading_account_id', accountId)
    .eq('rule_name', ruleName)
    .is('acknowledged_at', null)
    .limit(1)
  return data?.[0]?.id ?? null
}
