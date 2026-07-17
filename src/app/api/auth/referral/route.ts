import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { claimReferral } from "@/lib/services/partnerAdminService";
import { referralClaimSchema } from "@/lib/validation/schemas";

// POST /api/auth/referral — called right after signup to attribute the new
// trader to a partner via referral code. Tied to the authenticated session so
// a user can only attribute themselves. Invalid codes are ignored gracefully.
export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json().catch(() => null);
    const parsed = referralClaimSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("INVALID_REFERRAL_CODE", "Invalid referral code", 400);
    }
    const claimed = await claimReferral(user.id, parsed.data.code);
    if (!claimed) return jsonFail("INVALID_REFERRAL_CODE", "Referral code is invalid, inactive, or already claimed", 400);
    return jsonOk({ claimed });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
