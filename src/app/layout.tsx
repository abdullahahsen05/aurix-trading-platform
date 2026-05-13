import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aurix Trading Platform",
  description: "Trader dashboard, CRM, risk, and realtime account monitoring platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
