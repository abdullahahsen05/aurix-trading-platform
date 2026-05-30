export const runtime = 'nodejs';

import { jsonFail, jsonOk } from '@/lib/api/envelope';
import { requireTrader, AuthError } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { refreshAccountTrades } from '@/lib/services/brokerSyncService';
import { z } from 'zod';

const bodySchema = z.object({
  accountId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireTrader();
    const supabase = createAdminClient();

    console.log('[TRADER_SYNC_AUTH_USER]', { userId: user.id });

    let body: { accountId?: string } = {};
    try {
      const raw = await request.json();
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return jsonFail('INVALID_BODY', parsed.error.issues.map(i => i.message).join('; '), 400);
      }
      body = parsed.data;
    } catch {
      body = {};
    }

    // Fetch the trader's accounts that have a MetaAPI provider_account_id.
    // We select extra columns so logs can show exactly what account will be synced.
    let accountQuery = supabase
      .from('trading_accounts')
      .select('id, status, provider_account_id, last_synced_at')
      .eq('user_id', user.id)
      .not('provider_account_id', 'is', null);

    if (body.accountId) {
      accountQuery = accountQuery.eq('id', body.accountId);
    }

    const { data: accounts, error: acErr } = await accountQuery;

    if (acErr) {
      console.error('[TRADER_SYNC_DB_ERROR]', { message: acErr.message });
      return jsonFail('DB_ERROR', acErr.message, 500);
    }

    console.log('[TRADER_SYNC_ACCOUNTS_FOUND]', {
      count: accounts?.length ?? 0,
      accounts: (accounts ?? []).map(a => ({
        id: a.id,
        status: a.status,
        provider_account_id: a.provider_account_id,
        last_synced_at: a.last_synced_at,
      })),
    });

    if (!accounts || accounts.length === 0) {
      return jsonFail(
        'NO_CONNECTED_ACCOUNT',
        body.accountId
          ? 'Account not found, not owned by you, or not yet synced by an admin (provider_account_id is null).'
          : 'No connected accounts found. An admin must connect your account first.',
        400,
      );
    }

    const results = [];
    for (const account of accounts) {
      const summary = await refreshAccountTrades(account.id, user.id);
      results.push(summary);
    }

    return jsonOk({ results });

  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    const message = err instanceof Error ? err.message : 'Unexpected error during trade sync';
    console.error('[TRADER_SYNC_ERROR]', { message });
    return jsonFail('SYNC_ERROR', message, 500);
  }
}
