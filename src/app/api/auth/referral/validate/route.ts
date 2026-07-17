import { NextRequest } from "next/server";
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { validateReferralCode } from "@/lib/services/partnerAdminService";

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code")?.trim() ?? "";
  if (code.length < 2 || code.length > 40) {
    return jsonFail("INVALID_REFERRAL_CODE", "Enter a valid referral code", 400);
  }
  try {
    const valid = await validateReferralCode(code);
    if (!valid) return jsonFail("INVALID_REFERRAL_CODE", "This referral code is invalid or inactive", 404);
    return jsonOk({ valid: true, code: code.toUpperCase() });
  } catch {
    return jsonFail("REFERRAL_VALIDATION_FAILED", "Referral code could not be validated", 500);
  }
}
