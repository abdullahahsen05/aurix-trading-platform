import { notFound } from "next/navigation";
import { DemoWorkspace } from "@/components/demo/DemoWorkspace";
import { getDemoSectionConfig } from "@/lib/demo/config";

export default async function DemoSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const config = getDemoSectionConfig(section);

  if (!config) notFound();

  return <DemoWorkspace sectionSlug={config.slug} />;
}
