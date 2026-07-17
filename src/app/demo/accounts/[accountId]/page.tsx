import { DemoAccountDetail } from "@/components/demo/DemoAccountDetail";

export default async function DemoAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return <DemoAccountDetail accountId={accountId} />;
}
