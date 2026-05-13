"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { navItems } from "@/components/app/navigation";
import type { UserRole } from "@/lib/domain/types";

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
  const items = navItems.filter((item) => item.role === role);

  const renderNav = (closeDrawer?: () => void) => (
    <nav className="space-y-1.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={closeDrawer}
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
              active
                ? "bg-accent/15 text-accent shadow-[inset_3px_0_0_#ffcf00]"
                : "text-foreground/80 hover:bg-panel-strong hover:text-accent"
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
      <aside className="hidden min-h-screen w-[260px] border-r border-line bg-[#060701] px-5 py-5 lg:flex lg:flex-col">
        <div className="mb-7 px-2">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm font-black text-background">
              A
            </span>
            <h1 className="text-xl font-black tracking-tight text-foreground">AURIX</h1>
          </div>
        </div>
        <div className="mb-3 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Workspace</p>
        </div>
        {renderNav()}
        <div className="mt-6 border-t border-line/70 pt-4" />
      </aside>

      <Dialog.Root open={mobileNavOpen} onOpenChange={onMobileNavOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm lg:hidden" />
        <Dialog.Content className="fixed left-0 top-0 z-50 flex h-full w-[88vw] max-w-sm flex-col border-r border-line bg-[#050602] px-5 py-5 shadow-[18px_0_60px_rgba(0,0,0,0.45)] focus:outline-none lg:hidden">
          <Dialog.Title className="sr-only">Navigation menu</Dialog.Title>
          <div className="mb-7 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm font-black text-background">
                A
                </span>
                <h2 className="text-xl font-black tracking-tight text-foreground">AURIX</h2>
              </div>
              <Dialog.Close asChild>
                <button className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel text-muted">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <div className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Workspace</p>
            </div>
            {renderNav(() => onMobileNavOpenChange(false))}
            <div className="mt-6 border-t border-line/70 pt-4" />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
