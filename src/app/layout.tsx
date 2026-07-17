import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { QueryProvider } from "@/providers/QueryProvider";
import { PLATFORM_DESCRIPTION, PLATFORM_NAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: PLATFORM_NAME,
  description: PLATFORM_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
