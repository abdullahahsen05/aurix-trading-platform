import type { RiskRuleDto, RiskEventDto } from '@/lib/domain/types'

interface RiskRuleRow {
  id: string
  trading_account_id: string | null
  name: string
  severity: string
  action?: string
  metric: string
  threshold: number | string
  enabled: boolean
}

interface RiskEventRow {
  id: string
  trading_account_id: string
  rule_name: string
  severity: string
  message: string
  created_at: string
}

export function mapRiskRuleToDto(row: RiskRuleRow): RiskRuleDto {
  return {
    id: row.id,
    accountId: row.trading_account_id,
    scope: row.trading_account_id ? 'ACCOUNT' : 'PLATFORM',
    name: row.name,
    severity: row.severity as RiskRuleDto['severity'],
    action: (row.action ?? 'WARN') as RiskRuleDto['action'],
    metric: row.metric as RiskRuleDto['metric'],
    threshold: Number(row.threshold),
    enabled: row.enabled,
  }
}

export function mapRiskEventToDto(row: RiskEventRow): RiskEventDto {
  return {
    id: row.id,
    accountId: row.trading_account_id,
    ruleName: row.rule_name,
    severity: row.severity as RiskEventDto['severity'],
    message: row.message,
    createdAt: row.created_at,
  }
}
