"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { LogOut, X } from "lucide-react";
import { navItems } from "@/components/app/navigation";
import type { UserRole } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/client";
import { BRAND_INITIAL, BRAND_WORDMARK } from "@/lib/brand";

export function Sidebar({
  role,
  mobileNavOpen,
  onMobileNavOpenChange,
}: {
  role: UserRole;
  mobileNavOpen: boolean;
  onMobileNavOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const items = navItems.filter((item) => item.role === role);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    queryClient.clear();
    router.replace("/login");
    router.refresh();
  };

  const renderNav = (closeDrawer?: () => void) => (
    <nav className="flex flex-col gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeDrawer}
              className={`flex min-h-11 items-center gap-3 rounded-r-2xl border-l-2 px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? "border-l-accent bg-panel-strong/90 text-accent"
                  : "border-l-transparent text-foreground/78 hover:border-l-[#4a4730] hover:bg-panel-strong/55 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
      })}
    </nav>
  );

  return (
    <>
    <aside className="hidden h-screen w-[260px] self-start overflow-hidden border-r border-line bg-panel px-5 py-5 lg:sticky lg:top-0 lg:flex lg:flex-col">
        <div className="mb-7 px-2">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm font-black text-background shadow-[0_8px_20px_rgba(255,207,0,0.14)]">
              {BRAND_INITIAL}
            </span>
            <h1 className="text-xl font-black tracking-tight text-foreground">{BRAND_WORDMARK}</h1>
          </div>
        </div>
        <div className="mb-3 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Workspace</p>
        </div>
        <div className="mt-2 flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            {renderNav()}
          </div>
          <div className="border-t border-line/70 pt-4">
            <button
              type="button"
              onClick={handleLogout}
              className="btn-dark flex h-11 w-full items-center justify-center gap-2 px-4 text-sm text-muted transition hover:border-accent/40 hover:text-accent"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <Dialog.Root open={mobileNavOpen} onOpenChange={onMobileNavOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm lg:hidden" />
        <Dialog.Content className="fixed left-0 top-0 z-50 flex h-full w-[88vw] max-w-sm flex-col border-r border-line bg-panel px-5 py-5 shadow-[18px_0_60px_rgba(0,0,0,0.45)] focus:outline-none lg:hidden">
          <Dialog.Title className="sr-only">Navigation menu</Dialog.Title>
          <div className="mb-7 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm font-black text-background shadow-[0_8px_20px_rgba(255,207,0,0.14)]">
                {BRAND_INITIAL}
                </span>
                <h2 className="text-xl font-black tracking-tight text-foreground">{BRAND_WORDMARK}</h2>
              </div>
              <Dialog.Close asChild>
                <button className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-panel-strong text-muted">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <div className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Workspace</p>
            </div>
            <div className="mt-2 flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto">
                {renderNav(() => onMobileNavOpenChange(false))}
              </div>
              <div className="border-t border-line/70 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    onMobileNavOpenChange(false);
                    handleLogout();
                  }}
                  className="btn-dark flex h-11 w-full items-center justify-center gap-2 px-4 text-sm text-muted transition hover:border-accent/40 hover:text-accent"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
