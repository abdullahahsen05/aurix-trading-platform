// src/lib/services/notificationService.ts
if (typeof window !== 'undefined') {
  throw new Error('[aurix] notificationService is server-only.');
}

import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationDto } from '@/lib/domain/types';

export interface CreateNotificationParams {
  userId: string;
  accountId?: string;
  type: 'RISK_EVENT' | 'SYNC_SUCCESS' | 'SYNC_FAILURE';
  title: string;
  message: string;
  riskEventId?: string;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const supabase = createAdminClient();

  // Dedup: if this notification is for a risk event, skip if one already exists
  if (params.riskEventId) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('risk_event_id', params.riskEventId)
      .limit(1);
    if (existing && existing.length > 0) return;
  }

  await supabase.from('notifications').insert({
    user_id: params.userId,
    trading_account_id: params.accountId ?? null,
    type: params.type,
    title: params.title,
    message: params.message,
    risk_event_id: params.riskEventId ?? null,
  });
}

export async function listNotifications(userId: string): Promise<NotificationDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, trading_account_id, type, title, message, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    accountId: row.trading_account_id,
    type: row.type,
    title: row.title,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  return count ?? 0;
}

export async function markNotificationRead(id: string, userId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId); // ownership enforced here
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
}
