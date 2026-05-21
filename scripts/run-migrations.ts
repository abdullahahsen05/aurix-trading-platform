import { readFileSync } from 'fs'
import { join } from 'path'
import { Client } from 'pg'

const DB_HOST = 'db.brtdyxidblyimqteduph.supabase.co'
const DB_PORT = 5432
const DB_USER = 'postgres'
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD
if (!DB_PASSWORD) throw new Error('SUPABASE_DB_PASSWORD env var is required. Set it before running migrations.')
const DB_NAME = 'postgres'

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
    console.log('Connected to Supabase Postgres')

    const migrationFiles = [
      '001_schema.sql',
      '002_rls.sql',
    ]

    for (const file of migrationFiles) {
      const filePath = join(process.cwd(), 'supabase', 'migrations', file)
      const sql = readFileSync(filePath, 'utf-8')
      console.log(`\nRunning migration: ${file}`)
      await client.query(sql)
      console.log(`Migration ${file} complete`)
    }

    console.log('\nAll migrations applied successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigrations()
