import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/auditService";

export type ContactRequestStatus = "NEW" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface ContactRequestDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  type: "MENTORSHIP" | "GENERAL";
  status: ContactRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export class ContactRateLimitError extends Error {
  readonly statusCode = 429;
}

const SELECT_COLUMNS = "id, user_id, name, email, subject, message, type, status, created_at, updated_at";

function mapRequest(row: Record<string, unknown>): ContactRequestDto {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    email: row.email as string,
    subject: row.subject as string,
    message: row.message as string,
    type: row.type as ContactRequestDto["type"],
    status: row.status as ContactRequestStatus,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function createContactRequest(params: {
  userId: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  type: "MENTORSHIP" | "GENERAL";
}): Promise<ContactRequestDto> {
  const supabase = createAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("contact_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= 3) throw new ContactRateLimitError("Too many contact requests. Please try again in one hour.");

  const { data, error } = await supabase
    .from("contact_requests")
    .insert({
      user_id: params.userId,
      name: params.name,
      email: params.email,
      subject: params.subject,
      message: params.message,
      type: params.type,
      status: "NEW",
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Failed to create contact request: ${error?.message}`);

  await writeAuditLog({
    actorUserId: params.userId,
    action: "CONTACT_REQUEST_CREATED",
    entityType: "contact_request",
    entityId: data.id,
    metadata: { type: params.type },
  });
  return mapRequest(data as Record<string, unknown>);
}

export async function listContactRequestsForAdmin(): Promise<ContactRequestDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("contact_requests")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Failed to list contact requests: ${error.message}`);
  return (data ?? []).map((row) => mapRequest(row as Record<string, unknown>));
}

export async function updateContactRequestStatus(
  id: string,
  status: ContactRequestStatus,
  actorUserId: string,
): Promise<ContactRequestDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("contact_requests")
    .update({ status })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Failed to update contact request: ${error?.message}`);
  await writeAuditLog({
    actorUserId,
    action: "CONTACT_REQUEST_UPDATED",
    entityType: "contact_request",
    entityId: id,
    metadata: { status },
  });
  return mapRequest(data as Record<string, unknown>);
}
