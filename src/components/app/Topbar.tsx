"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell, CheckCircle2, ChevronDown, Info, LogOut, Menu, X } from "lucide-react";
import { tradingAccounts } from "@/lib/data/mockData";
import { navItems } from "@/components/app/navigation";
import type { UserRole } from "@/lib/domain/types";

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
    <header className="sticky top-0 z-20 border-b border-line bg-background/95 px-4 py-4 backdrop-blur lg:px-7">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onOpenMobileNav}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line text-muted lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden md:block">
            <p className="text-xl font-bold text-foreground">{activeItem?.label ?? "Workspace"}</p>
            <p className="mt-1 text-xs font-medium text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((current) => !current)}
              className="relative grid h-11 w-11 place-items-center rounded-full border border-line bg-panel text-muted transition hover:text-accent"
              aria-label="Show notifications"
              aria-expanded={notificationsOpen}
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-background">
                {notificationCount}
              </span>
            </button>

            <div
              className={`absolute right-0 top-full z-30 mt-3 w-[min(92vw,340px)] rounded-3xl border border-line bg-panel shadow-[0_22px_80px_rgba(0,0,0,0.45)] transition duration-150 ${
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
                      className="flex items-start gap-3 rounded-2xl border border-line/80 bg-background px-4 py-3"
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
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                role === "TRADER"
                  ? "bg-accent text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              User
            </Link>
            <Link
              href="/admin"
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                role === "ADMIN"
                  ? "bg-accent-2 text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Admin
            </Link>
          </div>
          <select className="h-11 rounded-full border border-line bg-panel px-5 text-sm font-semibold text-foreground outline-none">
            {tradingAccounts.map((account) => (
              <option key={account.accountId}>{account.accountName}</option>
            ))}
          </select>
          <Link
            href="/login"
            className="hidden h-11 items-center gap-2 rounded-full border border-line bg-panel px-5 text-sm font-semibold text-muted transition hover:border-accent/40 hover:text-accent sm:inline-flex"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Link>
          <button className="hidden h-11 items-center gap-2 rounded-full border border-line bg-panel px-5 text-sm font-bold text-accent sm:inline-flex">
            <span className="h-2 w-2 rounded-full bg-accent" />
            Account Status
            <ChevronDown className="h-4 w-4 text-muted" />
          </button>
        </div>
      </div>
      <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        <Link
          href="/dashboard"
          className={`shrink-0 rounded-md border border-line px-3 py-2 text-xs font-semibold ${
            role === "TRADER" ? "bg-accent text-background" : "text-muted"
          }`}
        >
          User
        </Link>
        <Link
          href="/admin"
          className={`shrink-0 rounded-md border border-line px-3 py-2 text-xs font-semibold ${
            role === "ADMIN" ? "bg-accent-2 text-background" : "text-muted"
          }`}
        >
          Admin
        </Link>
        {mobileItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 rounded-md border border-line px-3 py-2 text-xs text-muted"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
