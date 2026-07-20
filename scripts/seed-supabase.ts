import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load credentials from .env.local (never hardcode secrets — this file is committed).
function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i > -1) out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  } catch {
    /* fall back to process.env */
  }
  return out
}

const env = loadEnvLocal()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const daysAgo  = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()

async function seed() {
  console.log('Starting AURIX seed...')

  // ── 1. Clean up existing seed users ───────────────────────────────────────
  console.log('\n[1/10] Cleaning up existing seed data...')
  const { data: existingUsers, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) throw listErr

  const seedEmails = ['admin@aurix.local', 'ayan@aurix.local', 'sara@aurix.local']
  for (const user of existingUsers?.users ?? []) {
    if (seedEmails.includes(user.email ?? '')) {
      const { error } = await supabase.auth.admin.deleteUser(user.id)
      if (error) throw error
      console.log(`  Deleted user: ${user.email}`)
    }
  }

  // ── 2. Create auth users ───────────────────────────────────────────────────
  console.log('\n[2/10] Creating auth users...')

  const { data: adminAuth, error: adminErr } = await supabase.auth.admin.createUser({
    email: 'admin@aurix.local',
    password: 'Password123!',
    email_confirm: true,
    user_metadata: { full_name: 'Aurix Admin' },
  })
  if (adminErr) throw adminErr

  const { data: ayanAuth, error: ayanErr } = await supabase.auth.admin.createUser({
    email: 'ayan@aurix.local',
    password: 'Password123!',
    email_confirm: true,
    user_metadata: { full_name: 'Ayan Malik' },
  })
  if (ayanErr) throw ayanErr

  const { data: saraAuth, error: saraErr } = await supabase.auth.admin.createUser({
    email: 'sara@aurix.local',
    password: 'Password123!',
    email_confirm: true,
    user_metadata: { full_name: 'Sara Khan' },
  })
  if (saraErr) throw saraErr

  const adminId = adminAuth!.user!.id
  const ayanId  = ayanAuth!.user!.id
  const saraId  = saraAuth!.user!.id

  console.log(`  admin id: ${adminId}`)
  console.log(`  ayan  id: ${ayanId}`)
  console.log(`  sara  id: ${saraId}`)

  // ── 3. Fix admin role (DB trigger defaults everyone to TRADER) ─────────────
  console.log('\n[3/10] Fixing admin role...')
  const { error: adminRoleErr } = await supabase
    .from('profiles')
    .update({ role: 'SUPER_ADMIN' })
    .eq('id', adminId)
  if (adminRoleErr) throw adminRoleErr

  // Remove trader_profile row for admin (they shouldn't trade)
  const { error: delTpErr } = await supabase
    .from('trader_profiles')
    .delete()
    .eq('user_id', adminId)
  if (delTpErr) throw delTpErr

  console.log('  Admin role set to SUPER_ADMIN, trader_profile removed')

  // Update trader segments
  const { error: ayanSegErr } = await supabase
    .from('trader_profiles')
    .update({ segment: 'FUNDED' })
    .eq('user_id', ayanId)
  if (ayanSegErr) throw ayanSegErr

  const { error: saraSegErr } = await supabase
    .from('trader_profiles')
    .update({ segment: 'AT_RISK' })
    .eq('user_id', saraId)
  if (saraSegErr) throw saraSegErr

  console.log('  Trader segments updated')

  // ── 4. Trading accounts ────────────────────────────────────────────────────
  console.log('\n[4/10] Creating trading accounts...')

  const { data: orionAccount, error: orionErr } = await supabase
    .from('trading_accounts')
    .insert({
      user_id: ayanId,
      account_name: 'Orion Growth 100K',
      broker_name: 'MetaTrader 5 Demo',
      broker_account_id: 'MT5-ORION-001',
      status: 'CONNECTED',
      currency: 'USD',
      initial_balance: 100000,
    })
    .select('id')
    .single()
  if (orionErr) throw orionErr

  const { data: novaAccount, error: novaErr } = await supabase
    .from('trading_accounts')
    .insert({
      user_id: ayanId,
      account_name: 'Nova Evaluation 50K',
      broker_name: 'MetaApi Sandbox',
      broker_account_id: 'META-NOVA-002',
      status: 'SYNCING',
      currency: 'USD',
      initial_balance: 50000,
    })
    .select('id')
    .single()
  if (novaErr) throw novaErr

  const { data: saraBetaAccount, error: saraBetaErr } = await supabase
    .from('trading_accounts')
    .insert({
      user_id: saraId,
      account_name: 'Sara Beta Account',
      broker_name: 'MetaTrader 5 Demo',
      broker_account_id: 'MT5-SARA-003',
      status: 'CONNECTED',
      currency: 'USD',
      initial_balance: 50000,
    })
    .select('id')
    .single()
  if (saraBetaErr) throw saraBetaErr

  const orionId    = orionAccount!.id as string
  const novaId     = novaAccount!.id as string
  const saraBetaId = saraBetaAccount!.id as string

  console.log(`  Orion: ${orionId}`)
  console.log(`  Nova:  ${novaId}`)
  console.log(`  Sara Beta: ${saraBetaId}`)

  // ── 5. Account snapshots ───────────────────────────────────────────────────
  console.log('\n[5/10] Creating account snapshots...')

  // Orion – 28 snapshots every 6 hours over 7 days
  const orionSnapshots = Array.from({ length: 28 }, (_, i) => {
    const drift   = i * 118
    const pulse   = Math.sin(i / 2) * 520
    const balance = 100000 + drift
    const equity  = balance + pulse
    return {
      trading_account_id: orionId,
      balance:           Number(balance.toFixed(2)),
      equity:            Number(equity.toFixed(2)),
      floating_pnl:      Number(pulse.toFixed(2)),
      drawdown_percent:  pulse < 0 ? Number(Math.abs((pulse / balance) * 100).toFixed(2)) : 0,
      captured_at:       hoursAgo((27 - i) * 6),
    }
  })
  const { error: orionSnapErr } = await supabase.from('account_snapshots').insert(orionSnapshots)
  if (orionSnapErr) throw orionSnapErr
  console.log(`  Orion snapshots: ${orionSnapshots.length} rows inserted`)

  // Nova – 10 snapshots (slow decline)
  const novaSnapshots = Array.from({ length: 10 }, (_, i) => {
    const balance = 50000 - i * 70
    const equity  = balance - i * 52
    return {
      trading_account_id: novaId,
      balance:           Number(balance.toFixed(2)),
      equity:            Number(equity.toFixed(2)),
      floating_pnl:      Number((equity - balance).toFixed(2)),
      drawdown_percent:  Number(((50000 - equity) / 50000 * 100).toFixed(2)),
      captured_at:       hoursAgo((9 - i) * 12),
    }
  })
  const { error: novaSnapErr } = await supabase.from('account_snapshots').insert(novaSnapshots)
  if (novaSnapErr) throw novaSnapErr
  console.log(`  Nova snapshots: ${novaSnapshots.length} rows inserted`)

  // Sara Beta – single baseline snapshot
  const { error: saraSnapErr } = await supabase.from('account_snapshots').insert({
    trading_account_id: saraBetaId,
    balance:           50000,
    equity:            50000,
    floating_pnl:      0,
    drawdown_percent:  0,
    captured_at:       hoursAgo(1),
  })
  if (saraSnapErr) throw saraSnapErr
  console.log('  Sara Beta snapshot inserted')

  // ── 6. Trades ──────────────────────────────────────────────────────────────
  console.log('\n[6/10] Creating trades...')

  const symbols = ['EURUSD', 'XAUUSD', 'GBPJPY', 'NAS100']

  // 14 closed trades for Orion
  const closedTrades = Array.from({ length: 14 }, (_, i) => {
    const profit   = i % 4 === 0 ? -(240 + i * 11) : (320 + i * 17)
    const openedAt = hoursAgo(120 - i * 6)
    const closedAt = hoursAgo(116 - i * 6)
    return {
      trading_account_id: orionId,
      symbol:       symbols[i % 4],
      side:         i % 2 === 0 ? 'BUY' : 'SELL',
      status:       'CLOSED',
      volume:       Number((0.4 + i * 0.05).toFixed(2)),
      open_price:   Number((1.08 + i * 0.006).toFixed(6)),
      close_price:  Number((1.082 + i * 0.006).toFixed(6)),
      profit:       Number(profit.toFixed(2)),
      currency:     'USD',
      opened_at:    openedAt,
      closed_at:    closedAt,
    }
  })
  const { error: closedErr } = await supabase.from('trades').insert(closedTrades)
  if (closedErr) throw closedErr
  console.log(`  ${closedTrades.length} closed trades inserted for Orion`)

  // 2 open trades for Orion
  const { error: openOrionErr } = await supabase.from('trades').insert([
    {
      trading_account_id: orionId,
      symbol: 'XAUUSD', side: 'BUY', status: 'OPEN',
      volume: 0.8, open_price: 2341.4, close_price: null,
      profit: 418, currency: 'USD', opened_at: hoursAgo(5),
    },
    {
      trading_account_id: orionId,
      symbol: 'EURUSD', side: 'SELL', status: 'OPEN',
      volume: 1.2, open_price: 1.0872, close_price: null,
      profit: 244, currency: 'USD', opened_at: hoursAgo(4),
    },
  ])
  if (openOrionErr) throw openOrionErr
  console.log('  2 open trades inserted for Orion')

  // 1 open trade for Nova
  const { error: openNovaErr } = await supabase.from('trades').insert([
    {
      trading_account_id: novaId,
      symbol: 'NAS100', side: 'SELL', status: 'OPEN',
      volume: 0.3, open_price: 18422, close_price: null,
      profit: -524, currency: 'USD', opened_at: hoursAgo(3),
    },
  ])
  if (openNovaErr) throw openNovaErr
  console.log('  1 open trade inserted for Nova')

  // ── 7. Risk rules (platform-level, no account) ─────────────────────────────
  console.log('\n[7/10] Creating risk rules...')
  const { error: riskRulesErr } = await supabase.from('risk_rules').insert([
    { trading_account_id: null, name: 'Daily loss limit',         severity: 'CRITICAL', metric: 'DAILY_LOSS',   threshold: 2500, enabled: true },
    { trading_account_id: null, name: 'Maximum drawdown',         severity: 'WARNING',  metric: 'MAX_DRAWDOWN', threshold: 5,    enabled: true },
    { trading_account_id: null, name: 'Open trade concentration', severity: 'INFO',     metric: 'OPEN_TRADES',  threshold: 5,    enabled: true },
  ])
  if (riskRulesErr) throw riskRulesErr
  console.log('  3 risk rules inserted')

  // ── 8. Risk events ─────────────────────────────────────────────────────────
  console.log('\n[8/10] Creating risk events...')
  const { error: riskEvtErr } = await supabase.from('risk_events').insert([
    {
      trading_account_id: novaId,
      rule_name:          'Maximum drawdown',
      severity:           'WARNING',
      message:            'Nova Evaluation 50K is over the 5% drawdown warning threshold.',
      acknowledged_at:    null,
    },
  ])
  if (riskEvtErr) throw riskEvtErr
  console.log('  1 risk event inserted')

  // ── 9. CRM notes, activities, subscriptions ────────────────────────────────
  console.log('\n[9/10] Creating CRM data & subscriptions...')

  const { data: ayanTp, error: ayanTpErr } = await supabase
    .from('trader_profiles')
    .select('id')
    .eq('user_id', ayanId)
    .single()
  if (ayanTpErr) throw ayanTpErr

  const { data: saraTp, error: saraTpErr } = await supabase
    .from('trader_profiles')
    .select('id')
    .eq('user_id', saraId)
    .single()
  if (saraTpErr) throw saraTpErr

  const ayanTpId = ayanTp!.id as string
  const saraTpId = saraTp!.id as string

  // CRM notes
  const { error: notesErr } = await supabase.from('crm_notes').insert([
    {
      trader_profile_id: ayanTpId,
      author_user_id:    adminId,
      author_name:       'Admin',
      note:              'Requested MT5 investor password and broker server confirmation.',
    },
    {
      trader_profile_id: saraTpId,
      author_user_id:    adminId,
      author_name:       'Risk Desk',
      note:              'Warned trader about drawdown proximity and reduced position sizing.',
    },
  ])
  if (notesErr) throw notesErr
  console.log('  2 CRM notes inserted')

  // CRM activities
  const { error: activErr } = await supabase.from('crm_activities').insert([
    {
      trader_profile_id: ayanTpId,
      type:              'ACCOUNT_CONNECTED',
      description:       'Connected Orion Growth 100K account',
    },
    {
      trader_profile_id: saraTpId,
      type:              'RISK_WARNING',
      description:       'Risk warning issued for drawdown breach',
    },
  ])
  if (activErr) throw activErr
  console.log('  2 CRM activities inserted')

  // Subscriptions
  const { error: subsErr } = await supabase.from('subscriptions').insert([
    {
      trader_profile_id: ayanTpId,
      plan_name:  'Professional',
      status:     'active',
      started_at: daysAgo(30),
    },
    {
      trader_profile_id: saraTpId,
      plan_name:  'Evaluation',
      status:     'active',
      started_at: daysAgo(14),
    },
  ])
  if (subsErr) throw subsErr
  console.log('  2 subscriptions inserted')

  // ── 10. Audit logs ─────────────────────────────────────────────────────────
  console.log('\n[10/10] Creating audit logs...')
  const { error: auditErr } = await supabase.from('audit_logs').insert([
    {
      actor_user_id: adminId,
      action:        'USER_CREATED',
      entity_type:   'profiles',
      entity_id:     ayanId,
      metadata:      { email: 'ayan@aurix.local' },
    },
    {
      actor_user_id: adminId,
      action:        'USER_CREATED',
      entity_type:   'profiles',
      entity_id:     saraId,
      metadata:      { email: 'sara@aurix.local' },
    },
    {
      actor_user_id: ayanId,
      action:        'ACCOUNT_CONNECTED',
      entity_type:   'trading_accounts',
      entity_id:     orionId,
      metadata:      { account: 'Orion Growth 100K' },
    },
    {
      actor_user_id: adminId,
      action:        'RISK_RULE_CREATED',
      entity_type:   'risk_rules',
      entity_id:     null,
      metadata:      { rule: 'Daily loss limit' },
    },
  ])
  if (auditErr) throw auditErr
  console.log('  4 audit log entries inserted')

  console.log('\nSeed complete!')
  console.log('\nDemo Credentials:')
  console.log('  Admin:  admin@aurix.local / Password123!')
  console.log('  Trader: ayan@aurix.local  / Password123!')
  console.log('  Trader: sara@aurix.local  / Password123!')
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
