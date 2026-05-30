'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscribe to Supabase Realtime events and invalidate React Query caches.
 * Call this hook once in a top-level layout or dashboard component.
 */
export function useRealtimeUpdates(accountIds?: string[]) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createClient()

    // Subscribe to account snapshots
    const snapshotChannel = supabase
      .channel('account-snapshots')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'account_snapshots',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['trading-accounts'] })
      })
      .subscribe()

    // Subscribe to trades
    const tradeChannel = supabase
      .channel('trades-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trades',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['trades'] })
      })
      .subscribe()

    // Subscribe to risk events
    const riskChannel = supabase
      .channel('risk-events-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'risk_events',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['risk-events'] })
      })
      .subscribe()

    // Subscribe to notifications
    const notificationChannel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(snapshotChannel)
      supabase.removeChannel(tradeChannel)
      supabase.removeChannel(riskChannel)
      supabase.removeChannel(notificationChannel)
    }
  }, [queryClient])
}
