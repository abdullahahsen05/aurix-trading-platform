// Plain ESM script — uses createRequire to load MetaAPI CJS bundle (not the ESM-web bundle),
// which is exactly what Next.js serverExternalPackages does at runtime.
import { readFileSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'
import { createHash, createDecipheriv } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Force CJS require for metaapi — picks ./dist/index.js, not the ESM-web bundle
const require = createRequire(import.meta.url)

function loadEnv(projectRoot) {
  const out = {}
  const raw = readFileSync(join(projectRoot, '.env.local'), 'utf-8')
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > -1) out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

// ── Crypto (mirrors brokerCrypto.ts exactly) ──────────────────────────────────
function decryptSecret(payload, encKey) {
  const parts = payload.split(':')
  if (parts.length !== 3) throw new Error('Malformed ciphertext.')
  const [ivB64, tagB64, ctB64] = parts
  const key = createHash('sha256').update(encKey).digest()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf-8')
}

// ── Main sync logic ────────────────────────────────────────────────────────────
async function syncAccount(supabase, accountId, label, env) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`[${label}] Syncing ${accountId}`)
  const start = Date.now()

  // 1. Load account
  const { data: account } = await supabase
    .from('trading_accounts')
    .select('id, broker_name, status, provider_account_id, user_id')
    .eq('id', accountId)
    .single()
  if (!account) { console.error(`[${label}] Account not found`); return { status: 'DISCONNECTED' } }
  console.log(`[${label}] DB status: ${account.status}, provider_id: ${account.provider_account_id ?? 'none'}`)

  // 2. Load + decrypt credentials
  const { data: cred } = await supabase
    .from('broker_credentials')
    .select('provider, encrypted_reference')
    .eq('trading_account_id', accountId)
    .maybeSingle()
  if (!cred) { console.error(`[${label}] No credentials stored`); return { status: 'DISCONNECTED', error: 'No credentials' } }

  let secret
  try {
    secret = JSON.parse(decryptSecret(cred.encrypted_reference, env.ENCRYPTION_KEY))
  } catch (e) {
    console.error(`[${label}] Decrypt failed: ${e.message}`)
    return { status: 'DISCONNECTED', error: 'Decrypt failed' }
  }
  const platform = secret.platform ?? 'mt5'
  console.log(`[${label}] Credentials decrypted OK, platform=${platform}`)

  // 3. Mark SYNCING
  await supabase.from('trading_accounts').update({ status: 'SYNCING', sync_error: null }).eq('id', accountId)

  // 4. Load MetaAPI via CJS require (Node bundle, no window refs)
  const MetaApiModule = require('metaapi.cloud-sdk')
  const MetaApi = MetaApiModule.default ?? MetaApiModule
  const api = new MetaApi(env.METAAPI_TOKEN)
  let connection = null

  try {
    let metaAccount

    if (account.provider_account_id) {
      console.log(`[${label}] Reusing existing MetaAPI account: ${account.provider_account_id}`)
      metaAccount = await api.metatraderAccountApi.getAccount(account.provider_account_id)
    } else {
      console.log(`[${label}] Creating new MetaAPI account...`)
      metaAccount = await api.metatraderAccountApi.createAccount({
        login: secret.login,
        password: secret.password,
        server: secret.server,
        platform,
        name: `${account.broker_name ?? 'Account'}-${accountId.slice(0, 8)}`,
        magic: 0,
        type: 'cloud',
        reliability: env.METAAPI_RELIABILITY ?? 'regular',
      })
      console.log(`[${label}] Created MetaAPI account: ${metaAccount.id}`)
      // Save provider_account_id immediately
      await supabase.from('trading_accounts')
        .update({ provider_account_id: metaAccount.id, provider: 'metaapi', sync_error: null })
        .eq('id', accountId)
    }

    console.log(`[${label}] Account state: ${metaAccount.state}, connectionStatus: ${metaAccount.connectionStatus}`)

    // Deploy if needed
    if (metaAccount.state !== 'DEPLOYED') {
      console.log(`[${label}] Deploying...`)
      await metaAccount.deploy()
      await metaAccount.waitDeployed(120, 1000)
      console.log(`[${label}] Deployed`)
    }

    // Wait for broker connection
    console.log(`[${label}] Waiting for broker connection...`)
    await metaAccount.waitConnected(120, 1000)
    console.log(`[${label}] Broker connected`)

    // Open RPC connection
    connection = metaAccount.getRPCConnection()
    await connection.connect()
    console.log(`[${label}] RPC connecting...`)
    await connection.waitSynchronized(60)
    console.log(`[${label}] RPC synchronized`)

    // Fetch data
    const [info, positions] = await Promise.all([
      connection.getAccountInformation(),
      connection.getPositions(),
    ])
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const dealsResult = await connection.getDealsByTimeRange(since, new Date())
    const deals = Array.isArray(dealsResult) ? dealsResult : (dealsResult?.deals ?? [])

    const currency = info?.currency ?? 'USD'
    const balance  = info?.balance ?? 0
    const equity   = info?.equity ?? 0
    console.log(`[${label}] Account info: balance=${balance} ${currency}, equity=${equity}`)
    console.log(`[${label}] Open positions: ${Array.isArray(positions) ? positions.length : 0}`)
    console.log(`[${label}] Deals (30d): ${deals.length}`)

    // Insert snapshot
    await supabase.from('account_snapshots').insert({
      trading_account_id: accountId, balance, equity,
      floating_pnl: equity - balance,
      drawdown_percent: balance > 0 ? Math.max(0, ((balance - equity) / balance) * 100) : 0,
    })

    // Upsert trades
    const openRows = (Array.isArray(positions) ? positions : []).map(p => ({
      trading_account_id: accountId,
      external_trade_id: String(p.id),
      symbol: p.symbol ?? '', side: p.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
      status: 'OPEN', volume: p.volume ?? 0, open_price: p.openPrice ?? 0,
      close_price: null, profit: p.profit ?? 0, currency,
      opened_at: p.openTime ? new Date(p.openTime).toISOString() : new Date().toISOString(),
      closed_at: null,
    }))

    const closedRows = deals.filter(d => d.entryType === 'DEAL_ENTRY_OUT').map(d => ({
      trading_account_id: accountId,
      external_trade_id: String(d.positionId ?? d.id),
      symbol: d.symbol ?? '', side: d.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL',
      status: 'CLOSED', volume: d.volume ?? 0, open_price: 0,
      close_price: d.price ?? null, profit: d.profit ?? 0, currency,
      opened_at: d.time ? new Date(d.time).toISOString() : new Date().toISOString(),
      closed_at: d.time ? new Date(d.time).toISOString() : new Date().toISOString(),
    }))

    let tradesUpserted = 0
    const allTrades = [...openRows, ...closedRows]
    if (allTrades.length > 0) {
      const { data: upserted } = await supabase.from('trades')
        .upsert(allTrades, { onConflict: 'trading_account_id,external_trade_id' }).select('id')
      tradesUpserted = upserted?.length ?? 0
    }
    console.log(`[${label}] Trades upserted: ${tradesUpserted}`)

    // Mark CONNECTED
    await supabase.from('trading_accounts').update({
      status: 'CONNECTED', last_synced_at: new Date().toISOString(),
      sync_error: null, provider: 'metaapi', provider_account_id: metaAccount.id,
    }).eq('id', accountId)

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`[${label}] ✅ CONNECTED in ${elapsed}s — balance=${balance} ${currency}, trades=${tradesUpserted}`)
    return { status: 'CONNECTED', snapshotInserted: true, tradesUpserted, balance, equity, currency }

  } catch (err) {
    const msg = (err.message ?? String(err)).slice(0, 400)
    console.error(`[${label}] ❌ Error: ${msg}`)
    await supabase.from('trading_accounts').update({ status: 'DISCONNECTED', sync_error: msg }).eq('id', accountId)
    return { status: 'DISCONNECTED', error: msg }
  } finally {
    if (connection) { try { await connection.close() } catch {} }
    try { api.close() } catch {}
  }
}

// ── Entry ──────────────────────────────────────────────────────────────────────
const PROJECT_ROOT = 'C:\\Users\\abdul\\Desktop\\aurix-trading-platform-main'
const env = loadEnv(PROJECT_ROOT)

const MASTER_ID   = '8512fd35-6440-44ed-bf95-59b044c4d6bb'
const FOLLOWER_ID = 'bc9eafe3-b1aa-4399-b2c4-20816873602a'

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log('=== Aurix MetaAPI Sync (direct Node CJS path) ===\n')

if (!env.METAAPI_TOKEN)  { console.error('❌ METAAPI_TOKEN not set');  process.exit(1) }
if (!env.ENCRYPTION_KEY) { console.error('❌ ENCRYPTION_KEY not set'); process.exit(1) }

const masterResult   = await syncAccount(supabase, MASTER_ID,   'MASTER',   env)
const followerResult = await syncAccount(supabase, FOLLOWER_ID, 'FOLLOWER', env)

console.log(`\n${'═'.repeat(60)}`)
console.log('=== Final sync summary ===')
console.log(`Master   → status=${masterResult.status}  trades=${masterResult.tradesUpserted ?? 0}${masterResult.error ? `  error=${masterResult.error}` : ''}`)
console.log(`Follower → status=${followerResult.status}  trades=${followerResult.tradesUpserted ?? 0}${followerResult.error ? `  error=${followerResult.error}` : ''}`)
