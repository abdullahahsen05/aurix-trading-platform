import { isAdmin, type UserRole } from "@/lib/auth/rbac";

export function canUseAdminAssistant(role: UserRole): boolean {
  return isAdmin(role);
}

export function canUseGenericImageAnalysis(role: UserRole): boolean {
  return isAdmin(role);
}

export function canUseTraderChartAssistant(role: UserRole): boolean {
  return role === "TRADER";
}
