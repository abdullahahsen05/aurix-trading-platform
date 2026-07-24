"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { demoAccounts } from "@/lib/demo/demoData";
import { getDemoSectionFromPathname, listDemoSections } from "@/lib/demo/config";
import { BRAND_INITIAL, BRAND_WORDMARK } from "@/lib/brand";

function DemoNav({
  currentPathname,
  onNavigate,
}: {
  currentPathname: string;
  onNavigate?: () => void;
}) {
  const sections = listDemoSections();
  const workspaceSections = sections.filter((section) => section.group === "workspace");
  const productSections = sections.filter((section) => section.group === "products");

  const renderLinks = (items: typeof sections) =>
    items.map((item) => {
      const Icon = item.icon;
      const active = currentPathname === item.href || currentPathname.startsWith(`${item.href}/`);

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={`flex min-h-11 items-center gap-3 rounded-r-2xl border-l-2 px-3 py-2.5 text-sm font-semibold transition ${
            active
              ? "border-l-accent bg-panel-strong/90 text-accent"
              : "border-l-transparent text-foreground/78 hover:border-l-[#4a4730] hover:bg-panel-strong/55 hover:text-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
          {item.navLabel}
        </Link>
      );
    });

  return (
    <>
      <div className="mb-3 px-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Workspace</p>
      </div>
      <nav className="flex flex-col gap-3">{renderLinks(workspaceSections)}</nav>
      <div className="mt-6 mb-3 px-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Products</p>
      </div>
      <nav className="flex flex-col gap-3">{renderLinks(productSections)}</nav>
    </>
  );
}

export function DemoAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sections = listDemoSections();
  const activeSection = getDemoSectionFromPathname(pathname) ?? sections[0];
  const mobileItems = sections.slice(0, 6);

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside className="hidden h-screen w-[260px] self-start overflow-hidden border-r border-line bg-panel px-5 py-5 lg:sticky lg:top-0 lg:flex lg:flex-col">
          <div className="mb-7 px-2">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm font-black text-background shadow-[0_8px_20px_rgba(255,207,0,0.14)]">
                {BRAND_INITIAL}
              </span>
              <div>
                <h1 className="text-xl font-black tracking-tight text-foreground">{BRAND_WORDMARK}</h1>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Demo mode</p>
              </div>
            </div>
          </div>
          <div className="mt-2 flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto">
              <DemoNav currentPathname={pathname} />
            </div>
            <div className="space-y-3 border-t border-line/70 pt-4">
              <div className="rounded-[4px] border border-accent/20 bg-accent/5 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Demo Mode — sample data only</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Public workspace preview with no broker sync, live trading, or payments.
                </p>
              </div>
              <Link href="/register" className="btn-dark btn-active flex h-11 w-full items-center justify-center gap-2 px-4 text-sm">
                Create account
              </Link>
            </div>
          </div>
        </aside>

        <Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm lg:hidden" />
            <Dialog.Content className="fixed left-0 top-0 z-50 flex h-full w-[88vw] max-w-sm flex-col border-r border-line bg-panel px-5 py-5 shadow-[18px_0_60px_rgba(0,0,0,0.45)] focus:outline-none lg:hidden">
              <Dialog.Title className="sr-only">Demo navigation</Dialog.Title>
              <div className="mb-7 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm font-black text-background shadow-[0_8px_20px_rgba(255,207,0,0.14)]">
                    {BRAND_INITIAL}
                  </span>
                  <div>
                    <h2 className="text-xl font-black tracking-tight text-foreground">{BRAND_WORDMARK}</h2>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Demo mode</p>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-panel-strong text-muted">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
              <div className="mt-2 flex min-h-0 flex-1 flex-col">
                <div className="flex-1 overflow-y-auto">
                  <DemoNav currentPathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
                </div>
                <div className="space-y-3 border-t border-line/70 pt-4">
                  <div className="rounded-[4px] border border-accent/20 bg-accent/5 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Demo Mode — sample data only</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Public workspace preview with no broker sync, live trading, or payments.
                    </p>
                  </div>
                  <Link
                    href="/register"
                    onClick={() => setMobileNavOpen(false)}
                    className="btn-dark btn-active flex h-11 w-full items-center justify-center gap-2 px-4 text-sm"
                  >
                    Create account
                  </Link>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur-lg lg:px-7">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-panel-strong text-muted lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-foreground">{activeSection.title}</p>
                  <p className="mt-0.5 hidden truncate text-xs font-medium text-muted md:block">
                    {activeSection.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent sm:inline-flex">
                  Demo mode
                </span>
                <select
                  aria-label="Demo trading account"
                  className="hidden h-10 rounded-full border border-[rgba(255,255,255,0.08)] bg-panel-strong px-4 text-sm font-semibold text-foreground outline-none lg:inline-flex"
                  defaultValue={demoAccounts[0]?.id}
                >
                  {demoAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
                <Link href="/register" className="btn-dark btn-active hidden sm:inline-flex">
                  Create account
                </Link>
                <Link href="/login" className="btn-dark hidden sm:inline-flex">
                  Back to login
                </Link>
              </div>
            </div>
            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {mobileItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`btn-dark h-9 shrink-0 px-4 text-xs ${pathname === item.href ? "btn-active" : "text-muted"}`}
                >
                  {item.navLabel}
                </Link>
              ))}
            </nav>
          </header>
          <main className="relative flex-1 px-4 py-5 lg:px-7">{children}</main>
        </div>
      </div>
    </div>
  );
}
