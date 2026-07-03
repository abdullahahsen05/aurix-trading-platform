import { readFileSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)

function loadEnv(root) {
  const out = {}
  const raw = readFileSync(join(root, '.env.local'), 'utf-8')
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > -1) out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

function decryptCreds(payload, encKey) {
  const parts = payload.split(':')
  if (parts.length !== 3) throw new Error('Malformed ciphertext.')
  const [ivB64, tagB64, ctB64] = parts
  const key = createHash('sha256').update(encKey).digest()
  const crypto = require('crypto')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf-8')
}

const PROJECT_ROOT = 'C:\\Users\\abdul\\Desktop\\aurix-trading-platform-main'
const env = loadEnv(PROJECT_ROOT)
const NEW_MASTER_ID = '90c26ec3-5394-4139-a611-f0ee2cf46bc4'

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log('=== Syncing New Master Account ===')
if (!env.METAAPI_TOKEN)  { console.error('METAAPI_TOKEN not set'); process.exit(1) }
if (!env.ENCRYPTION_KEY) { console.error('ENCRYPTION_KEY not set'); process.exit(1) }

const { data: account } = await supabase
  .from('trading_accounts').select('id, broker_name, status, provider_account_id')
  .eq('id', NEW_MASTER_ID).single()
console.log(`DB: "${account.account_name ?? 'Master MT5 Demo - Local Test'}" status=${account.status}, provider_id=${account.provider_account_id ?? 'none'}`)

const { data: cred } = await supabase
  .from('broker_credentials').select('encrypted_reference')
  .eq('trading_account_id', NEW_MASTER_ID).maybeSingle()
if (!cred) { console.error('No credentials stored'); process.exit(1) }

const secret = JSON.parse(decryptCreds(cred.encrypted_reference, env.ENCRYPTION_KEY))
console.log(`Credentials decrypted OK — platform=${secret.platform ?? 'mt5'}`)

await supabase.from('trading_accounts')
  .update({ status: 'SYNCING', sync_error: null }).eq('id', NEW_MASTER_ID)

const MetaApiModule = require('metaapi.cloud-sdk')
const MetaApi = MetaApiModule.default ?? MetaApiModule
const api = new MetaApi(env.METAAPI_TOKEN)
let connection = null

try {
  let metaAccount

  if (account.provider_account_id) {
    console.log(`\nReusing existing MetaAPI account: ${account.provider_account_id}`)
    metaAccount = await api.metatraderAccountApi.getAccount(account.provider_account_id)
  } else {
    console.log('\nCreating MetaAPI account...')
    metaAccount = await api.metatraderAccountApi.createAccount({
      login: secret.login,
      password: secret.password,
      server: secret.server,
      platform: secret.platform ?? 'mt5',
      name: `MasterLocal-${NEW_MASTER_ID.slice(0, 8)}`,
      magic: 0,
      type: 'cloud',
      reliability: env.METAAPI_RELIABILITY ?? 'regular',
    })
    console.log(`MetaAPI account created: ${metaAccount.id}`)
    await supabase.from('trading_accounts')
      .update({ provider_account_id: metaAccount.id, provider: 'metaapi', sync_error: null })
      .eq('id', NEW_MASTER_ID)
    console.log('provider_account_id saved to DB immediately')
  }

  console.log(`State: ${metaAccount.state}, connectionStatus: ${metaAccount.connectionStatus}`)

  if (metaAccount.state !== 'DEPLOYED') {
    console.log('Deploying...')
    await metaAccount.deploy()
    await metaAccount.waitDeployed(120, 1000)
    console.log('Deployed')
  }

  console.log('Waiting for broker connection...')
  await metaAccount.waitConnected(120, 1000)
  console.log('Broker connected')

  connection = metaAccount.getRPCConnection()
  await connection.connect()
  console.log('RPC connecting...')
  await connection.waitSynchronized(60)
  console.log('RPC synchronized')

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
  console.log(`\nAccount info: balance=${balance} ${currency}, equity=${equity}`)
  console.log(`Open positions: ${Array.isArray(positions) ? positions.length : 0}`)
  console.log(`Deals (30d): ${deals.length}`)

  await supabase.from('account_snapshots').insert({
    trading_account_id: NEW_MASTER_ID, balance, equity,
    floating_pnl: equity - balance,
    drawdown_percent: balance > 0 ? Math.max(0, ((balance - equity) / balance) * 100) : 0,
  })

  const openRows = (Array.isArray(positions) ? positions : []).map(p => ({
    trading_account_id: NEW_MASTER_ID,
    external_trade_id: String(p.id),
    symbol: p.symbol ?? '', side: p.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
    status: 'OPEN', volume: p.volume ?? 0, open_price: p.openPrice ?? 0,
    close_price: null, profit: p.profit ?? 0, currency,
    opened_at: p.openTime ? new Date(p.openTime).toISOString() : new Date().toISOString(),
    closed_at: null,
  }))

  const closedRows = deals.filter(d => d.entryType === 'DEAL_ENTRY_OUT').map(d => ({
    trading_account_id: NEW_MASTER_ID,
    external_trade_id: String(d.positionId ?? d.id),
    symbol: d.symbol ?? '', side: d.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL',
    status: 'CLOSED', volume: d.volume ?? 0, open_price: 0,
    close_price: d.price ?? null, profit: d.profit ?? 0, currency,
    opened_at: d.time ? new Date(d.time).toISOString() : new Date().toISOString(),
    closed_at: d.time ? new Date(d.time).toISOString() : new Date().toISOString(),
  }))

  const allTrades = [...openRows, ...closedRows]
  let tradesUpserted = 0
  if (allTrades.length > 0) {
    const { data: upserted } = await supabase.from('trades')
      .upsert(allTrades, { onConflict: 'trading_account_id,external_trade_id' }).select('id')
    tradesUpserted = upserted?.length ?? 0
  }

  await supabase.from('trading_accounts').update({
    status: 'CONNECTED', last_synced_at: new Date().toISOString(),
    sync_error: null, provider: 'metaapi', provider_account_id: metaAccount.id,
  }).eq('id', NEW_MASTER_ID)

  console.log(`\n✅ CONNECTED — balance=${balance} ${currency}, snapshot written, trades=${tradesUpserted}`)
  console.log(`MetaAPI ID: ${metaAccount.id}`)

} catch (err) {
  const msg = (err.message ?? String(err)).slice(0, 400)
  console.error(`\n❌ Sync failed: ${msg}`)
  await supabase.from('trading_accounts')
    .update({ status: 'DISCONNECTED', sync_error: msg }).eq('id', NEW_MASTER_ID)
} finally {
  if (connection) try { await connection.close() } catch {}
  try { api.close() } catch {}
}
