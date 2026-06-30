import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Seed demo trading data for trader@aurix.local so the AI assistant has real,
// data-grounded context (accounts, snapshots, open/closed trades, a risk event)
// plus one upcoming USD high-impact event for news-context testing.
// Idempotent: clears the trader's existing accounts (cascade) before reseeding.
// ─────────────────────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > -1) out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

const env = loadEnv()
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TRADER_EMAIL = 'trader@aurix.local'
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

async function run() {
  // 1. Find the trader.
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', TRADER_EMAIL)
    .single()
  if (pErr || !profile) throw new Error(`Trader ${TRADER_EMAIL} not found`)
  const traderId = profile.id as string
  console.log(`Trader id: ${traderId}`)

  // 2. Clear existing accounts (cascades to snapshots/trades/risk_events).
  await supabase.from('trading_accounts').delete().eq('user_id', traderId)
  console.log('Cleared existing accounts.')

  // 3. Account.
  const { data: acct, error: aErr } = await supabase
    .from('trading_accounts')
    .insert({
      user_id: traderId,
      account_name: 'Apex Funded 100K',
      broker_name: 'MetaTrader 5 Demo',
      broker_account_id: 'MT5-APEX-001',
      status: 'CONNECTED',
      currency: 'USD',
      initial_balance: 100000,
    })
    .select('id')
    .single()
  if (aErr || !acct) throw aErr
  const accountId = acct.id as string
  console.log(`Account: ${accountId}`)

  // 4. Snapshots — 28 points over 7 days: growth then a drawdown.
  const snapshots = Array.from({ length: 28 }, (_, i) => {
    const drift = i * 95
    const pulse = Math.sin(i / 2.3) * 640 - (i > 20 ? (i - 20) * 180 : 0)
    const balance = 100000 + drift
    const equity = balance + pulse
    return {
      trading_account_id: accountId,
      balance: Number(balance.toFixed(2)),
      equity: Number(equity.toFixed(2)),
      floating_pnl: Number(pulse.toFixed(2)),
      drawdown_percent: pulse < 0 ? Number(Math.abs((pulse / balance) * 100).toFixed(2)) : 0,
      captured_at: hoursAgo((27 - i) * 6),
    }
  })
  await supabase.from('account_snapshots').insert(snapshots)
  console.log(`Inserted ${snapshots.length} snapshots.`)

  // 5. Closed trades — mixed wins/losses across EURUSD/XAUUSD/GBPJPY.
  const symbols = ['EURUSD', 'XAUUSD', 'GBPJPY']
  const closed = Array.from({ length: 12 }, (_, i) => {
    const profit = i % 3 === 0 ? -(180 + i * 14) : (260 + i * 19)
    return {
      trading_account_id: accountId,
      symbol: symbols[i % 3],
      side: i % 2 === 0 ? 'BUY' : 'SELL',
      status: 'CLOSED',
      volume: Number((0.4 + i * 0.05).toFixed(2)),
      open_price: Number((1.08 + i * 0.004).toFixed(5)),
      close_price: Number((1.082 + i * 0.004).toFixed(5)),
      profit: Number(profit.toFixed(2)),
      currency: 'USD',
      opened_at: hoursAgo(120 - i * 6),
      closed_at: hoursAgo(116 - i * 6),
    }
  })
  await supabase.from('trades').insert(closed)
  console.log(`Inserted ${closed.length} closed trades.`)

  // 6. Open trades — EURUSD short + XAUUSD long (→ USD/EUR/XAU exposure).
  await supabase.from('trades').insert([
    {
      trading_account_id: accountId,
      symbol: 'EURUSD', side: 'SELL', status: 'OPEN',
      volume: 1.2, open_price: 1.0872, close_price: null,
      profit: -312, currency: 'USD', opened_at: hoursAgo(5),
    },
    {
      trading_account_id: accountId,
      symbol: 'XAUUSD', side: 'BUY', status: 'OPEN',
      volume: 0.8, open_price: 2341.4, close_price: null,
      profit: 486, currency: 'USD', opened_at: hoursAgo(3),
    },
  ])
  console.log('Inserted 2 open trades.')

  // 7. Risk event (warning).
  await supabase.from('risk_events').insert({
    trading_account_id: accountId,
    rule_name: 'Maximum drawdown',
    severity: 'WARNING',
    message: 'Apex Funded 100K approached the 5% drawdown warning threshold.',
    acknowledged_at: null,
  })
  console.log('Inserted 1 risk event.')

  // 8. One upcoming USD high-impact economic event for news-context testing.
  await supabase.from('economic_calendar_events').insert({
    title: 'US Non-Farm Payrolls',
    country_code: 'US',
    currency: 'USD',
    impact: 'HIGH',
    event_time: hoursFromNow(3),
    forecast: '180K',
    previous: '175K',
    source: 'BLS',
  })
  console.log('Inserted 1 upcoming USD high-impact event.')

  console.log('\nDemo data seeded for', TRADER_EMAIL)
}

run().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
