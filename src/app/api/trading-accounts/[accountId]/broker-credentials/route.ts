import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, assertCanAccessAccount, AuthError } from "@/lib/auth/session";
import {
  storeBrokerCredentials,
  getDecryptedCredentials,
  BrokerCredentialError,
} from "@/lib/services/brokerCredentialService";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const storeSchema = z.object({
  platform: z.enum(["MT5", "MT4"]).default("MT5"),
  login: z.string().min(1, "Login is required").max(50).trim(),
  password: z.string().min(1, "Password is required").max(200).trim(),
  server: z.string().min(1, "Server is required").max(100).trim(),
  brokerName: z.string().max(100).trim().optional(),
});

// GET — safe credential status (never returns password or encrypted payload)
export async function GET(
  _req: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await context.params;
    const user = await requireAuth();

    if (user.role === "PARTNER") {
      return jsonFail("FORBIDDEN", "Partners cannot access broker credentials.", 403);
    }

    await assertCanAccessAccount(accountId);

    const supabase = createAdminClient();

    const [credRow, accountRow] = await Promise.all([
      supabase
        .from("broker_credentials")
        .select("provider, created_at, updated_at")
        .eq("trading_account_id", accountId)
        .maybeSingle(),
      supabase
        .from("trading_accounts")
        .select("provider_account_id, last_synced_at, sync_error, status")
        .eq("id", accountId)
        .maybeSingle(),
    ]);

    return jsonOk({
      accountId,
      credentialsStored: !!credRow.data,
      provider: credRow.data?.provider ?? null,
      providerAccountId: accountRow.data?.provider_account_id ?? null,
      lastSyncedAt: accountRow.data?.last_synced_at ?? null,
      syncError: accountRow.data?.sync_error ?? null,
      status: accountRow.data?.status ?? null,
    });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}

// POST — encrypt and store broker credentials
export async function POST(
  req: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await context.params;
    const user = await requireAuth();

    if (user.role === "PARTNER") {
      return jsonFail("FORBIDDEN", "Partners cannot store broker credentials.", 403);
    }

    await assertCanAccessAccount(accountId);

    const body = await req.json().catch(() => null);
    const parsed = storeSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
        400,
      );
    }

    const { platform, login, password, server, brokerName } = parsed.data;

    await storeBrokerCredentials(accountId, {
      login,
      password,
      server,
      platform: platform.toLowerCase() as "mt4" | "mt5",
      provider: process.env.BROKER_PROVIDER ?? "metaapi",
      brokerName,
    });

    // Update broker_name on trading_accounts if provided
    if (brokerName) {
      const supabase = createAdminClient();
      await supabase
        .from("trading_accounts")
        .update({ broker_name: brokerName })
        .eq("id", accountId);
    }

    void writeAuditLog({
      actorUserId: user.id,
      action: "BROKER_CREDENTIALS_STORED",
      entityType: "trading_account",
      entityId: accountId,
      // Never log login, password, or encrypted payload
      metadata: { platform, server: "[stored]" },
    });

    return jsonOk({
      accountId,
      credentialsStored: true,
      platform,
      server,
    });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof BrokerCredentialError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof Error && err.message.includes("ENCRYPTION_KEY")) {
      return jsonFail(
        "BROKER_CREDENTIAL_STORE_FAILED",
        "Encryption is not configured on this server. Set ENCRYPTION_KEY.",
        503,
      );
    }
    throw err;
  }
}
