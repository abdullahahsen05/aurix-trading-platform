import { isAdmin, type UserRole, type UserStatus } from "@/lib/auth/rbac";

export function canReadCalendarEvent(params: {
  role: UserRole;
  userStatus: UserStatus;
  eventStatus: "DRAFT" | "PUBLISHED" | "CANCELLED";
  audience: "ALL" | "TRADER";
}): boolean {
  if (params.userStatus !== "ACTIVE") return false;
  if (isAdmin(params.role)) return true;
  return params.role === "TRADER" && params.eventStatus === "PUBLISHED" && ["ALL", "TRADER"].includes(params.audience);
}

export function canManageCalendar(role: UserRole, status: UserStatus): boolean {
  return status === "ACTIVE" && isAdmin(role);
}
