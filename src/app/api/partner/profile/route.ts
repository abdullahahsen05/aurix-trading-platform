import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requirePartner, AuthError } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { PartnerProfileStatus } from "@/lib/partner/profile";

export async function GET() {
  try {
    const user = await requirePartner();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("partner_profiles")
      .select("status, referral_code, commission_percent")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return jsonOk({
      status: (data?.status ?? "PENDING_REVIEW") as PartnerProfileStatus,
      setupComplete: Boolean(data),
      referralCode: (data?.referral_code ?? null) as string | null,
      commissionPercent: data ? Number(data.commission_percent) : 0,
    });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
