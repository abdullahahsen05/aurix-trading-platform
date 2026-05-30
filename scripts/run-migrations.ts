import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { Client } from 'pg'

const DB_HOST = 'db.brtdyxidblyimqteduph.supabase.co'
const DB_PORT = 5432
const DB_USER = 'postgres'
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD
if (!DB_PASSWORD) throw new Error('SUPABASE_DB_PASSWORD env var is required.')
const DB_NAME = 'postgres'

// All migrations in order. Add new files here as they are created.
const ALL_MIGRATIONS = [
  '001_schema.sql',
  '002_rls.sql',
  '003_security_hardening.sql',
  '004_broker_sync.sql',
  '005_risk_notifications.sql',
]

async function runMigrations() {
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    console.log('Connected to Supabase Postgres\n')

    // Create a simple migrations tracking table if it does not exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    for (const file of ALL_MIGRATIONS) {
      // Check if already applied
      const { rows } = await client.query(
        'SELECT 1 FROM public._migrations WHERE name = $1',
        [file]
      )
      if (rows.length > 0) {
        console.log(`  [skip]  ${file}  (already applied)`)
        continue
      }

      const filePath = join(process.cwd(), 'supabase', 'migrations', file)
      if (!existsSync(filePath)) {
        console.warn(`  [warn]  ${file} not found — skipping`)
        continue
      }

      const sql = readFileSync(filePath, 'utf-8')
      console.log(`  [run]   ${file}`)
      await client.query(sql)

      // Mark as applied
      await client.query(
        'INSERT INTO public._migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
        [file]
      )
      console.log(`  [done]  ${file}`)
    }

    console.log('\nAll migrations up to date.')
  } catch (error) {
    console.error('\nMigration failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigrations()
