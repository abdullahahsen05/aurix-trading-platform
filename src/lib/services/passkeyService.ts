import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type Base64URLString,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getPasskeyConfig } from "@/lib/auth/passkeyConfig";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/auditService";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export class PasskeyError extends Error {
  constructor(message: string, readonly code = "PASSKEY_ERROR", readonly statusCode = 400) {
    super(message);
  }
}

export interface PasskeyDto {
  id: string;
  deviceName: string;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

type TraderIdentity = { id: string; email: string; name: string };

async function createChallenge(userId: string | null, purpose: "REGISTRATION" | "AUTHENTICATION", challenge: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("user_passkey_challenges")
    .insert({
      user_id: userId,
      purpose,
      challenge,
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new PasskeyError("Could not create a passkey challenge.", "PASSKEY_STORAGE_ERROR", 500);
  return data.id as string;
}

async function getChallenge(params: {
  challengeId: string;
  purpose: "REGISTRATION" | "AUTHENTICATION";
  userId?: string;
}) {
  const supabase = createAdminClient();
  let query = supabase
    .from("user_passkey_challenges")
    .select("id, user_id, challenge, expires_at, consumed_at")
    .eq("id", params.challengeId)
    .eq("purpose", params.purpose)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString());
  if (params.userId) query = query.eq("user_id", params.userId);
  const { data } = await query.maybeSingle();
  if (!data) throw new PasskeyError("Passkey challenge is invalid or expired.", "PASSKEY_CHALLENGE_INVALID", 400);
  return data;
}

async function consumeChallenge(challengeId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("user_passkey_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challengeId)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!data) throw new PasskeyError("Passkey challenge was already used.", "PASSKEY_REPLAY_BLOCKED", 409);
}

export async function startPasskeyRegistration(user: TraderIdentity) {
  const config = getPasskeyConfig();
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("user_passkeys")
    .select("credential_id, transports")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((credential) => ({
      id: credential.credential_id as Base64URLString,
      transports: (credential.transports ?? []) as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
  return { options, challengeId: await createChallenge(user.id, "REGISTRATION", options.challenge) };
}

export async function verifyPasskeyRegistration(params: {
  user: TraderIdentity;
  challengeId: string;
  response: RegistrationResponseJSON;
  deviceName: string;
}): Promise<PasskeyDto> {
  const config = getPasskeyConfig();
  const challenge = await getChallenge({ challengeId: params.challengeId, purpose: "REGISTRATION", userId: params.user.id });
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: params.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.expectedOrigin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new PasskeyError("Passkey registration could not be verified.", "PASSKEY_VERIFICATION_FAILED", 400);
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new PasskeyError("Passkey registration could not be verified.", "PASSKEY_VERIFICATION_FAILED", 400);
  }
  await consumeChallenge(params.challengeId);

  const info = verification.registrationInfo;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("user_passkeys")
    .insert({
      user_id: params.user.id,
      credential_id: info.credential.id,
      public_key: Buffer.from(info.credential.publicKey).toString("base64url"),
      counter: info.credential.counter,
      transports: info.credential.transports ?? params.response.response.transports ?? [],
      device_type: info.credentialDeviceType,
      backed_up: info.credentialBackedUp,
      device_name: params.deviceName.trim() || "Passkey",
    })
    .select("id, device_name, transports, created_at, last_used_at")
    .single();
  if (error || !data) {
    const duplicate = error?.code === "23505";
    throw new PasskeyError(duplicate ? "This passkey is already registered." : "Could not save the passkey.", duplicate ? "PASSKEY_EXISTS" : "PASSKEY_STORAGE_ERROR", duplicate ? 409 : 500);
  }
  await writeAuditLog({ actorUserId: params.user.id, action: "PASSKEY_REGISTERED", entityType: "user_passkey", entityId: data.id, metadata: {} });
  return {
    id: data.id,
    deviceName: data.device_name,
    transports: data.transports ?? [],
    createdAt: data.created_at,
    lastUsedAt: data.last_used_at,
  };
}

export async function startPasskeyAuthentication() {
  const config = getPasskeyConfig();
  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: "required",
  });
  return { options, challengeId: await createChallenge(null, "AUTHENTICATION", options.challenge) };
}

export async function verifyPasskeyAuthentication(params: {
  challengeId: string;
  response: AuthenticationResponseJSON;
}): Promise<{ userId: string; email: string }> {
  const config = getPasskeyConfig();
  const challenge = await getChallenge({ challengeId: params.challengeId, purpose: "AUTHENTICATION" });
  const supabase = createAdminClient();
  const { data: passkey } = await supabase
    .from("user_passkeys")
    .select("id, user_id, credential_id, public_key, counter, transports, revoked_at, profiles!inner(email, role, status)")
    .eq("credential_id", params.response.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (!passkey) throw new PasskeyError("Passkey is not registered.", "PASSKEY_NOT_FOUND", 404);
  const profile = passkey.profiles as unknown as { email: string; role: string; status: string };
  if (profile.role !== "TRADER" || profile.status !== "ACTIVE") {
    throw new PasskeyError("This passkey cannot sign in to a trader workspace.", "PASSKEY_FORBIDDEN", 403);
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: params.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.expectedOrigin,
      expectedRPID: config.rpID,
      credential: {
        id: passkey.credential_id as Base64URLString,
        publicKey: new Uint8Array(Buffer.from(passkey.public_key, "base64url")),
        counter: Number(passkey.counter),
        transports: (passkey.transports ?? []) as AuthenticatorTransportFuture[],
      },
      requireUserVerification: true,
    });
  } catch {
    throw new PasskeyError("Passkey sign-in could not be verified.", "PASSKEY_VERIFICATION_FAILED", 401);
  }
  if (!verification.verified) throw new PasskeyError("Passkey sign-in could not be verified.", "PASSKEY_VERIFICATION_FAILED", 401);
  await consumeChallenge(params.challengeId);

  const { data: updated } = await supabase
    .from("user_passkeys")
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq("id", passkey.id)
    .eq("counter", passkey.counter)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (!updated) throw new PasskeyError("Passkey counter replay was blocked.", "PASSKEY_REPLAY_BLOCKED", 409);

  await writeAuditLog({ actorUserId: passkey.user_id, action: "PASSKEY_LOGIN", entityType: "user_passkey", entityId: passkey.id, metadata: {} });
  return { userId: passkey.user_id, email: profile.email };
}

export async function listPasskeys(userId: string): Promise<PasskeyDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("user_passkeys")
    .select("id, device_name, transports, created_at, last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new PasskeyError("Could not list passkeys.", "PASSKEY_STORAGE_ERROR", 500);
  return (data ?? []).map((row) => ({
    id: row.id,
    deviceName: row.device_name,
    transports: row.transports ?? [],
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export async function revokePasskey(userId: string, passkeyId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("user_passkeys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", passkeyId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (!data) throw new PasskeyError("Passkey not found.", "PASSKEY_NOT_FOUND", 404);
  await writeAuditLog({ actorUserId: userId, action: "PASSKEY_REVOKED", entityType: "user_passkey", entityId: passkeyId, metadata: {} });
}
