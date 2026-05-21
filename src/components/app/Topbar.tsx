"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell, CheckCircle2, Info, Menu, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { navItems } from "@/components/app/navigation";
import type { UserRole, TraderAccountSummary } from "@/lib/domain/types";

export function Topbar({
  role,
  onOpenMobileNav,
}: {
  role: UserRole;
  onOpenMobileNav: () => void;
}) {
  const pathname = usePathname();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const { data: tradingAccounts = [] } = useQuery<TraderAccountSummary[]>({
    queryKey: ["trading-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/trading-accounts");
      const json = await res.json();
      if (!json.ok) return [];
      return json.data;
    },
  });
  const mobileItems = navItems.filter((item) => item.role === role).slice(0, 6);
  const activeItem =
    navItems
      .filter((item) => item.role === role)
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((left, right) => right.href.length - left.href.length)[0] ?? mobileItems[0];
  const subtitle =
    activeItem?.href === "/dashboard"
      ? "Equity, risk, and performance at a glance."
      : activeItem?.href === "/accounts"
        ? "Broker-linked accounts and connection health."
        : activeItem?.href === "/analytics"
          ? "Profitability, drawdown, and performance quality."
          : activeItem?.href === "/risk"
            ? "Rules, limits, and review queue monitoring."
            : activeItem?.href === "/reports"
              ? "Exports, summaries, and schedules."
              : activeItem?.href === "/settings"
                ? "Profile, broker, and security preferences."
                : role === "ADMIN"
                  ? "Platform supervision, CRM, and audit workflows."
                  : "Manage trading operations and account performance.";
  const notificationCount = role === "ADMIN" ? 3 : 2;
  const notifications = [
    {
      title: "Risk warning",
      description: "Daily loss threshold is nearing the alert line.",
      tone: "danger" as const,
      icon: AlertTriangle,
      time: "2m ago",
    },
    {
      title: "Account sync",
      description: "2 broker-linked accounts updated successfully.",
      tone: "lime" as const,
      icon: CheckCircle2,
      time: "11m ago",
    },
    {
      title: "Platform note",
      description: "New review items are waiting in the CRM queue.",
      tone: "accent" as const,
      icon: Info,
      time: "Today",
    },
  ];

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    }

    if (notificationsOpen) {
      window.addEventListener("pointerdown", handlePointerDown);
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [notificationsOpen]);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur-lg lg:px-7">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onOpenMobileNav}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-panel-strong text-muted lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="hidden md:block">
            <p className="text-lg font-bold text-foreground">{activeItem?.label ?? "Workspace"}</p>
            <p className="mt-0.5 text-xs font-medium text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((current) => !current)}
              className="relative grid h-9 w-9 place-items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-panel-strong text-muted transition hover:border-accent/40 hover:text-accent"
              aria-label="Show notifications"
              aria-expanded={notificationsOpen}
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-background">
                {notificationCount}
              </span>
            </button>

            <div
              className={`absolute right-0 top-full z-30 mt-3 w-[min(92vw,340px)] rounded-[20px] border border-line bg-panel shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition duration-150 ${
                notificationsOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
              }`}
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Notifications</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">Recent updates</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-line bg-background text-muted transition hover:text-foreground"
                  aria-label="Close notifications"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-80 overflow-auto p-2">
                {notifications.map((notification) => {
                  const Icon = notification.icon;
                  const toneClass =
                    notification.tone === "danger"
                      ? "text-danger bg-danger/10 border-danger/20"
                      : notification.tone === "lime"
                        ? "text-accent-2 bg-accent-2/10 border-accent-2/20"
                        : "text-accent bg-accent/10 border-accent/20";

                  return (
                    <div
                      key={notification.title}
                      className="flex items-start gap-3 rounded-[16px] border border-line bg-background/70 px-4 py-3"
                    >
                      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${toneClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-foreground">{notification.title}</p>
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                            {notification.time}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted">{notification.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="hidden rounded-full border border-line bg-panel p-1 sm:flex">
            <Link
              href="/dashboard"
              className={`btn-dark rounded-full text-xs ${role === "TRADER" ? "btn-active" : ""}`}
            >
              User
            </Link>
            <Link
              href="/admin"
              className={`btn-dark rounded-full text-xs ${role === "ADMIN" ? "btn-active" : ""}`}
            >
              Admin
            </Link>
          </div>
          <select className="h-10 rounded-full border border-[rgba(255,255,255,0.08)] bg-panel-strong px-4 text-sm font-semibold text-foreground outline-none">
            {tradingAccounts.map((account) => (
              <option key={account.accountId}>{account.accountName}</option>
            ))}
          </select>
        </div>
      </div>
      <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        <Link
          href="/dashboard"
          className={`btn-dark h-9 shrink-0 px-4 text-xs ${role === "TRADER" ? "btn-active" : ""}`}
        >
          User
        </Link>
        <Link
          href="/admin"
          className={`btn-dark h-9 shrink-0 px-4 text-xs ${role === "ADMIN" ? "btn-active" : ""}`}
        >
          Admin
        </Link>
        {mobileItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="btn-dark h-9 shrink-0 px-4 text-xs text-muted"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
