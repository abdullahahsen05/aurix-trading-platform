import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await requireAuth();
    const supabase = createAdminClient();

    // Get all trading account IDs for this user
    const { data: accounts } = await supabase
      .from('trading_accounts')
      .select('id')
      .eq('user_id', user.id);

    if (!accounts || accounts.length === 0) {
      return jsonOk({ dailyPnl: 0, currency: 'USD' });
    }

    const accountIds = accounts.map((a) => a.id);

    // UTC day boundary
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: trades } = await supabase
      .from('trades')
      .select('profit, currency')
      .in('trading_account_id', accountIds)
      .eq('status', 'CLOSED')
      .gte('closed_at', todayStart.toISOString());

    const dailyPnl = (trades ?? []).reduce((sum, t) => sum + Number(t.profit), 0);
    const currency = trades?.[0]?.currency ?? 'USD';

    return jsonOk({ dailyPnl, currency });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
