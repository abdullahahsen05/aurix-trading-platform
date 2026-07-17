import { redirect } from "next/navigation";
import { DEMO_HOME_SECTION } from "@/lib/demo/config";

export default function DemoEntryPage() {
  redirect(`/demo/${DEMO_HOME_SECTION}`);
}
