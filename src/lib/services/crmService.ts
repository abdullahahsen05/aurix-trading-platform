import { createAdminClient } from '@/lib/supabase/admin'
import { mapCrmNoteToDto, mapTraderProfileToDto } from '@/lib/mappers/crmMapper'
import type { CrmNoteDto, TraderProfileDto } from '@/lib/domain/types'

export async function listTraderProfiles(): Promise<TraderProfileDto[]> {
  // Use admin client to bypass RLS — this function is only called from
  // admin API routes that already gate access via requireAdmin().
  const supabase = createAdminClient()

  // trading_accounts.user_id → profiles.id, not trader_profiles.id.
  // Traverse: trader_profiles → profiles → trading_accounts.
  const { data, error } = await supabase
    .from('trader_profiles')
    .select(`
      id,
      user_id,
      segment,
      profiles!user_id(
        full_name,
        email,
        trading_accounts(
          id,
          account_snapshots(equity)
        )
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch trader profiles: ${error.message}`)

  return (data ?? []).map(row => mapTraderProfileToDto(row as any))
}

export async function listCrmNotes(traderId?: string): Promise<CrmNoteDto[]> {
  // Use admin client to bypass RLS — only called from admin-gated routes.
  const supabase = createAdminClient()

  let query = supabase
    .from('crm_notes')
    .select('id, trader_profile_id, author_name, note, created_at')
    .order('created_at', { ascending: false })

  if (traderId) {
    query = query.eq('trader_profile_id', traderId)
  }

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch CRM notes: ${error.message}`)

  return (data ?? []).map(mapCrmNoteToDto)
}

export async function createCrmNote(data: {
  traderId: string
  authorName: string
  note: string
  authorUserId?: string
}): Promise<CrmNoteDto> {
  // Use admin client — called from admin-gated POST /api/crm/notes.
  const supabase = createAdminClient()

  const { data: note, error } = await supabase
    .from('crm_notes')
    .insert({
      trader_profile_id: data.traderId,
      author_user_id: data.authorUserId ?? null,
      author_name: data.authorName,
      note: data.note,
    })
    .select('id, trader_profile_id, author_name, note, created_at')
    .single()

  if (error || !note) throw new Error(`Failed to create CRM note: ${error?.message}`)
  return mapCrmNoteToDto(note)
}
