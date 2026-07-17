import { PartnerWorkspaceGate } from "@/components/partner/PartnerWorkspaceGate";

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <PartnerWorkspaceGate>{children}</PartnerWorkspaceGate>;
}
