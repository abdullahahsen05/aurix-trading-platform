"use client";

import { useState } from "react";
import { StatusPill, GhostButton, PrimaryButton } from "@/components/app/WorkspaceUI";
import { BillingCheckoutModal } from "@/components/app/BillingCheckoutModal";
import type { SubscriptionDto } from "@/lib/services/billingService";

const PLATFORM_PRODUCT = {
  code: "PLATFORM_MONTHLY",
  name: "Aurix Platform Subscription",
  amount: 50,
  currency: "USD",
  billingInterval: "MONTHLY",
  description:
    "Access MT5 account tracking, core trading workspace features, AI tools, and professional platform workflows. Renews monthly from your subscription approval date.",
};

export function PlatformSubscriptionCheckoutCTA({
  access,
  activateLabel = "Activate subscription",
  renewLabel = "Renew subscription",
  buttonVariant = "primary",
}: {
  access: SubscriptionDto;
  activateLabel?: string;
  renewLabel?: string;
  buttonVariant?: "primary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const ButtonComponent = buttonVariant === "primary" ? PrimaryButton : GhostButton;

  if (access.status === "PENDING_APPROVAL") {
    return <StatusPill tone="accent">Payment received — pending admin approval</StatusPill>;
  }

  if (access.status === "PENDING_PAYMENT") {
    return <StatusPill tone="muted">Payment pending</StatusPill>;
  }

  if (access.status === "ACTIVE") {
    return <StatusPill tone="lime">Active</StatusPill>;
  }

  const label = access.status === "EXPIRED" ? renewLabel : activateLabel;

  return (
    <>
      <ButtonComponent type="button" onClick={() => setOpen(true)}>
        {label}
      </ButtonComponent>
      <BillingCheckoutModal
        open={open}
        onClose={() => setOpen(false)}
        product={PLATFORM_PRODUCT}
      />
    </>
  );
}
