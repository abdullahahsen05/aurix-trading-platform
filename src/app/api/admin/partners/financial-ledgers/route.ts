import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPartnerFinancialLedger } from "@/lib/services/partnerWithdrawalService";

export async function GET() {
  try {
    await requireAdmin();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("partner_profiles")
      .select("user_id")
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw error;
    const ledgers = await Promise.all(
      (data ?? []).map((partner) => getPartnerFinancialLedger(partner.user_id)),
    );
    return jsonOk({ ledgers });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("PARTNER_LEDGER_UNAVAILABLE", "Partner financial ledgers are unavailable.", 500);
  }
}
