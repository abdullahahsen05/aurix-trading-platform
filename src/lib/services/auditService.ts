import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Audit Service
//
// All writes go through the service-role admin client, which bypasses RLS.
// This is intentional: the audit_logs table has NO client-facing INSERT policy
// (dropped in migration 003). Only this server-side function — or other
// service-role code — can insert audit records.
//
// Never pass secrets, passwords, or encrypted_reference values in metadata.
// ─────────────────────────────────────────────────────────────────────────────

export type AuditAction =
  | "USER_STATUS_CHANGED"
  | "USER_ROLE_CHANGED"
  | "ACCOUNT_CONNECTED"
  | "ACCOUNT_DISCONNECTED"
  | "ACCOUNT_RESTRICTED"
  | "ACCOUNT_VERIFIED"
  | "RISK_RULE_CREATED"
  | "RISK_RULE_UPDATED"
  | "RISK_EVENT_CREATED"
  | "RISK_EVENT_ACKNOWLEDGED"
  | "CRM_NOTE_CREATED"
  | "SUBSCRIPTION_UPDATED"
  | "BROKER_CREDENTIALS_STORED"
  | "ACCOUNT_SYNC_TRIGGERED"
  | "ACCOUNT_SYNC_COMPLETED"
  | "ACCOUNT_SYNC_FAILED";

export interface WriteAuditLogParams {
  /** UUID of the admin or service performing the action. Null for system jobs. */
  actorUserId: string | null;
  action: AuditAction;
  /** The type of entity being acted on, e.g. "profile", "trading_account" */
  entityType: string;
  /** UUID of the entity being acted on */
  entityId: string | null;
  /**
   * Additional context. Keep this minimal and NEVER include secrets,
   * passwords, or full credential objects.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Write a single audit log entry.
 * Silently swallows errors so that a logging failure never breaks the
 * primary business operation. Errors are console-logged for observability.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("audit_logs").insert({
      actor_user_id: params.actorUserId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      metadata: params.metadata ?? null,
    });

    if (error) {
      console.error("[auditService] Failed to write audit log:", error.message, params);
    }
  } catch (err) {
    console.error("[auditService] Unexpected error writing audit log:", err, params);
  }
}
