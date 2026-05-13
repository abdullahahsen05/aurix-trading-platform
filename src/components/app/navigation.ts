import type { ComponentType } from "react";
import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  Bell,
  BookOpenCheck,
  CandlestickChart,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldAlert,
  Users,
  WalletCards,
} from "lucide-react";
import type { UserRole } from "@/lib/domain/types";

export interface NavItem {
  href: string;
  label: string;
  role: UserRole;
  icon: ComponentType<{ className?: string }>;
}

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", role: "TRADER", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", role: "TRADER", icon: WalletCards },
  { href: "/trades", label: "Trades", role: "TRADER", icon: CandlestickChart },
  { href: "/analytics", label: "Analytics", role: "TRADER", icon: BarChart3 },
  { href: "/risk", label: "Risk", role: "TRADER", icon: ShieldAlert },
  { href: "/reports", label: "Reports", role: "TRADER", icon: BookOpenCheck },
  { href: "/settings", label: "Settings", role: "TRADER", icon: Settings },
  { href: "/admin", label: "Overview", role: "ADMIN", icon: Gauge },
  { href: "/admin/users", label: "Users", role: "ADMIN", icon: Users },
  { href: "/admin/traders", label: "Traders", role: "ADMIN", icon: Activity },
  { href: "/admin/accounts", label: "Supervision", role: "ADMIN", icon: WalletCards },
  { href: "/admin/crm", label: "CRM", role: "ADMIN", icon: Bell },
  { href: "/admin/risk", label: "Risk Rules", role: "ADMIN", icon: ShieldAlert },
  { href: "/admin/subscriptions", label: "Subscriptions", role: "ADMIN", icon: BadgeDollarSign },
  { href: "/admin/audit", label: "Audit", role: "ADMIN", icon: ListChecks },
];
