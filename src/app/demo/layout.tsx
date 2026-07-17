import { DemoAppShell } from "@/components/demo/DemoAppShell";

export default function DemoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DemoAppShell>{children}</DemoAppShell>;
}
