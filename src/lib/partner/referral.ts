// ─────────────────────────────────────────────────────────────────────────────
// Partner referral codes (pure helpers — no DB).
// Format: BASE-SUFFIX, e.g. "AYANFX-7K2QD". BASE is derived from the partner's
// name/email; SUFFIX is a random alphanumeric block for uniqueness.
// ─────────────────────────────────────────────────────────────────────────────

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

function randomSuffix(len = 5): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Build a referral code from a seed (name or email). Random suffix keeps it unique. */
export function generateReferralCode(seed: string): string {
  const base =
    (seed || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6) || "PARTNER";
  return `${base}-${randomSuffix()}`;
}

/** Loose format check for codes entered via referral links. */
export function isValidReferralCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{2,12}-[A-Z0-9]{3,8}$/.test(code.trim().toUpperCase());
}

/** Build the shareable referral link for a code. */
export function referralLink(siteUrl: string, code: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/register?ref=${encodeURIComponent(code.trim().toUpperCase())}`;
}
