// src/lib/services/riskEvaluationService.ts
if (typeof window !== 'undefined') {
  throw new Error('[aurix] riskEvaluationService is server-only.');
}

import { createAdminClient } from '@/lib/supabase/admin';
import { evaluateRiskRules } from '@/lib/domain/risk';
import { mapRiskRuleToDto } from '@/lib/mappers/riskMapper';
import { createRiskEvent, findActiveRiskEvent } from '@/lib/services/riskService';
import { createNotification } from '@/lib/services/notificationService';
import { writeAuditLog } from '@/lib/services/auditService';
import type { AccountStatus, TraderAccountSummary } from '@/lib/domain/types';

// ── Pure helpers (exported for unit tests) ───────────────────────────────────

export function computeDailyPnl(
  trades: Array<{ profit: string | number }>,
): number {
  return trades.reduce((sum, t) => sum + Number(t.profit), 0);
}

export function buildAccountInput(
  accountId: string,
  accountName: string,
  brokerName: string,
  status: string,
  snapshot: { balance: number | string; equity: number | string; drawdown_percent: number | string } | null,
  openTradeCount: number,
): TraderAccountSummary {
  return {
    accountId,
    accountName,
    brokerName,
    serverName: null,
    platform: null,
    status: status as AccountStatus,
    balance: { amount: Number(snapshot?.balance ?? 0), currency: 'USD' },
    equity: { amount: Number(snapshot?.equity ?? 0), currency: 'USD' },
    floatingPnl: { amount: 0, currency: 'USD' },
    openTradeCount,
    drawdownPercent: Number(snapshot?.drawdown_percent ?? 0),
    updatedAt: new Date().toISOString(),
  };
}

// ── Main orchestration ────────────────────────────────────────────────────────

export async function evaluateAndPersistRiskEvents(
  accountId: string,
  actorUserId: string | null,
): Promise<void> {
  const supabase = createAdminClient();

  // 1. Load account
  const { data: account, error: accountErr } = await supabase
    .from('trading_accounts')
    .select('id, user_id, account_name, broker_name, status')
    .eq('id', accountId)
    .single();

  if (accountErr || !account) {
    console.warn('[RISK_EVAL] Account not found:', accountId);
    return;
  }

  // 2. Latest snapshot (may be null if market never connected)
  const { data: snapshots, error: snapshotErr } = await supabase
    .from('account_snapshots')
    .select('balance, equity, drawdown_percent')
    .eq('trading_account_id', accountId)
    .order('captured_at', { ascending: false })
    .limit(1);
  if (snapshotErr) console.warn('[RISK_EVAL] Snapshot query failed, using defaults:', snapshotErr.message);
  const snapshot = snapshots?.[0] ?? null;

  // 3. Today's closed trade PnL (UTC day boundary)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: closedToday, error: closedErr } = await supabase
    .from('trades')
    .select('profit')
    .eq('trading_account_id', accountId)
    .eq('status', 'CLOSED')
    .gte('closed_at', todayStart.toISOString());
  if (closedErr) console.warn('[RISK_EVAL] Closed trades query failed, daily PnL defaults to 0:', closedErr.message);
  const dailyProfit = computeDailyPnl(closedToday ?? []);

  // 4. Open trade count
  const { count: openCount, error: countErr } = await supabase
    .from('trades')
    .select('id', { count: 'exact', head: true })
    .eq('trading_account_id', accountId)
    .eq('status', 'OPEN');
  if (countErr) console.warn('[RISK_EVAL] Open trade count query failed, defaulting to 0:', countErr.message);

  // 5. Risk rules (platform + account-specific)
  const { data: platformRules, error: platformErr } = await supabase
    .from('risk_rules')
    .select('id, trading_account_id, name, severity, metric, threshold, enabled')
    .is('trading_account_id', null)
    .eq('enabled', true);
  if (platformErr) console.warn('[RISK_EVAL] Platform rules query failed:', platformErr.message);

  const { data: accountRules, error: accountRulesErr } = await supabase
    .from('risk_rules')
    .select('id, trading_account_id, name, severity, metric, threshold, enabled')
    .eq('trading_account_id', accountId)
    .eq('enabled', true);
  if (accountRulesErr) console.warn('[RISK_EVAL] Account rules query failed:', accountRulesErr.message);

  const rules = [...(platformRules ?? []), ...(accountRules ?? [])].map(mapRiskRuleToDto);

  if (rules.length === 0) return;

  // 6. Evaluate
  const accountInput = buildAccountInput(
    accountId,
    account.account_name,
    account.broker_name,
    account.status,
    snapshot,
    openCount ?? 0,   // null when count query fails; defaults to 0 (safe)
  );

  const events = evaluateRiskRules({
    account: accountInput,
    trades: [],
    rules,
    dailyProfit,
  });

  // 7. Persist new events — skip duplicates
  for (const event of events) {
    const existingId = await findActiveRiskEvent(accountId, event.ruleName);
    if (existingId) continue;

    let newEventId: string;
    try {
      newEventId = await createRiskEvent({
        accountId,
        ruleName: event.ruleName,
        severity: event.severity,
        message: event.message,
      });
    } catch (err) {
      console.error('[RISK_EVAL] Failed to create risk event:', err);
      continue;
    }

    void createNotification({
      userId: account.user_id,
      accountId,
      type: 'RISK_EVENT',
      title: `Risk alert: ${event.ruleName}`,
      message: event.message,
      riskEventId: newEventId,
    }).catch((err) => console.error('[RISK_EVAL] Notification error:', err));

    void writeAuditLog({
      actorUserId,
      action: 'RISK_EVENT_CREATED',
      entityType: 'risk_event',
      entityId: newEventId,
      metadata: { ruleName: event.ruleName, severity: event.severity, accountId },
    });
  }
}
