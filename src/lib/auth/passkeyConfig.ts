import { BRAND_NAME } from "@/lib/brand";

export interface PasskeyConfig {
  rpID: string;
  rpName: string;
  expectedOrigin: string;
}

export class PasskeyConfigurationError extends Error {}

export function resolvePasskeyConfig(
  env: Record<string, string | undefined>,
  nodeEnv: string | undefined,
): PasskeyConfig {
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? (nodeEnv === "production" ? undefined : "http://localhost:3000");
  if (!appUrl) throw new PasskeyConfigurationError("NEXT_PUBLIC_APP_URL is required for passkeys.");

  let origin: URL;
  try {
    origin = new URL(appUrl);
  } catch {
    throw new PasskeyConfigurationError("NEXT_PUBLIC_APP_URL must be an absolute URL.");
  }
  if (nodeEnv === "production" && origin.protocol !== "https:") {
    throw new PasskeyConfigurationError("Passkeys require an HTTPS application URL in production.");
  }

  const rpID = env.WEBAUTHN_RP_ID ?? origin.hostname;
  const matchesOrigin = origin.hostname === rpID || origin.hostname.endsWith(`.${rpID}`);
  if (!matchesOrigin) throw new PasskeyConfigurationError("WEBAUTHN_RP_ID must match the application hostname.");

  return {
    rpID,
    rpName: env.NEXT_PUBLIC_WEBAUTHN_RP_NAME?.trim() || BRAND_NAME,
    expectedOrigin: origin.origin,
  };
}

export function getPasskeyConfig(): PasskeyConfig {
  return resolvePasskeyConfig(process.env, process.env.NODE_ENV);
}

export function canUseTraderPasskeys(role: string, status: string): boolean {
  return role === "TRADER" && status === "ACTIVE";
}
