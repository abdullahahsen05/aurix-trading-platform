import { getDemoSectionConfig, listDemoSections } from "@/lib/demo/config";

export type BillingRuntimeMode = "mock" | "stripe";

export function getBillingRuntimeMode(env: { BILLING_PROVIDER?: string }): BillingRuntimeMode {
  const provider = env.BILLING_PROVIDER?.toLowerCase();
  if (provider === "stripe") return "stripe";
  return "mock";
}

export function buildMockCheckoutUrl(returnUrl: string, orderId: string) {
  const url = new URL(returnUrl);
  url.searchParams.set("orderId", orderId);
  url.searchParams.set("mock", "1");
  return url.toString();
}

export { getDemoSectionConfig, listDemoSections };
