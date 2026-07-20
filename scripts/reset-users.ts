import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// One-off utility: delete ALL auth users, then seed exactly one ADMIN and one
// TRADER. Deleting an auth user cascades to profiles → trading_accounts →
// snapshots/trades/risk_events/ai_* via ON DELETE CASCADE.
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
// ─────────────────────────────────────────────────────────────────────────────

function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
  } catch {
    // fall back to process.env below
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

const ADMIN = { email: 'admin@aurix.local', password: 'Password123!', fullName: 'Aurix Admin' }
const TRADER = { email: 'trader@aurix.local', password: 'Password123!', fullName: 'Demo Trader' }

async function deleteAllUsers() {
  console.log('\n[1/3] Deleting ALL existing auth users...')
  let deleted = 0
  // listUsers is paginated; loop until empty.
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const users = data?.users ?? []
    if (users.length === 0) break
    for (const u of users) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id)
      if (delErr) {
        console.warn(`  [warn] could not delete ${u.email}: ${delErr.message}`)
      } else {
        deleted++
        console.log(`  deleted: ${u.email}`)
      }
    }
    // After deletions the list shrinks; re-query page 1 next loop.
    if (users.length < 200) {
      // Re-check page 1 once more in case deletions left stragglers.
      const { data: recheck } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
      if ((recheck?.users ?? []).length === 0) break
    }
  }
  console.log(`  total deleted: ${deleted}`)
}

async function createUser(u: { email: string; password: string; fullName: string }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { full_name: u.fullName },
  })
  if (error) throw error
  return data!.user!.id
}

async function run() {
  await deleteAllUsers()

  console.log('\n[2/3] Creating admin + trader...')
  const adminId = await createUser(ADMIN)
  const traderId = await createUser(TRADER)
  console.log(`  admin id:  ${adminId}`)
  console.log(`  trader id: ${traderId}`)

  console.log('\n[3/3] Promoting admin (DB trigger defaults everyone to TRADER)...')
  const { error: roleErr } = await supabase.from('profiles').update({ role: 'SUPER_ADMIN' }).eq('id', adminId)
  if (roleErr) throw roleErr
  // Admins should not carry a trader_profile row.
  await supabase.from('trader_profiles').delete().eq('user_id', adminId)
  console.log('  admin promoted to SUPER_ADMIN')

  console.log('\nDone. Credentials:')
  console.log(`  Admin:  ${ADMIN.email} / ${ADMIN.password}`)
  console.log(`  Trader: ${TRADER.email} / ${TRADER.password}`)
}

run().catch((err) => {
  console.error('\nReset failed:', err)
  process.exit(1)
})
