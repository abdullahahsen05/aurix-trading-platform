"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/app/WorkspaceUI";
import { TextField } from "@/components/app/FormFields";
import { createClient } from "@/lib/supabase/client";
import { BRAND_INITIAL, BRAND_NAME, BRAND_WORDMARK } from "@/lib/brand";

type Role = "TRADER" | "PARTNER";

const ROLE_OPTIONS: { role: Role; eyebrow: string; title: string; description: string }[] = [
  {
    role: "TRADER",
    eyebrow: "For traders",
    title: "I am a Trader",
    description:
      "Access the WSA Global trading platform, MT5 accounts, copy trading, AI assistant, bots, academy, and evaluations.",
  },
  {
    role: "PARTNER",
    eyebrow: "For affiliates",
    title: "I am a Partner / Affiliate",
    description:
      "Refer traders, track commissions, and manage payouts through the partner portal.",
  },
];

export default function RegisterPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [referralCode, setReferralCode] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("ref") ??
          new URLSearchParams(window.location.search).get("partner") ??
          "").trim().toUpperCase(),
  );
  const router = useRouter();

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setError("");
    setMessage("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRole) return;
    setIsSubmitting(true);
    setMessage("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const fullName = formData.get("fullName") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setIsSubmitting(false);
      setError("Passwords do not match.");
      return;
    }

    const normalizedReferralCode = referralCode.trim().toUpperCase();
    if (selectedRole === "TRADER" && normalizedReferralCode) {
      const validationResponse = await fetch(
        `/api/auth/referral/validate?code=${encodeURIComponent(normalizedReferralCode)}`,
      );
      const validationJson = await validationResponse.json();
      if (!validationJson.ok) {
        setIsSubmitting(false);
        setError(validationJson.error?.message ?? "This referral code is invalid or inactive.");
        return;
      }
    }

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // role is read by the handle_new_user() DB trigger.
        // ADMIN is never accepted — the trigger enforces TRADER as the fallback.
        data: {
          full_name: fullName,
          role: selectedRole,
          ...(selectedRole === "TRADER" && normalizedReferralCode
            ? { referral_code: normalizedReferralCode }
            : {}),
        },
      },
    });

    if (authError) {
      setIsSubmitting(false);
      setError(authError.message);
      return;
    }

    const redirect = selectedRole === "PARTNER" ? "/partner" : "/platform-preview";
    setMessage("Account created. Redirecting...");
    router.push(redirect);
  };

  // ── Step 1: Role selection ────────────────────────────────────────────────
  if (step === 1) {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-10">
        <section className="w-full max-w-xl">
          <div className="mb-8 text-center">
            <div className="mb-5 flex items-center justify-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-accent text-sm font-black text-background">
                {BRAND_INITIAL}
              </span>
              <span className="text-xl font-semibold text-foreground">{BRAND_WORDMARK}</span>
            </div>
            <h1 className="text-2xl font-semibold text-foreground">How will you use {BRAND_NAME}?</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Choose your account type to get started.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {ROLE_OPTIONS.map(({ role, eyebrow, title, description }) => (
              <button
                key={role}
                type="button"
                onClick={() => handleRoleSelect(role)}
                className="group flex flex-col gap-2 rounded-3xl border border-line bg-panel p-6 text-left transition-all hover:border-accent/40 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                  {eyebrow}
                </p>
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
                <p className="text-sm leading-6 text-muted">{description}</p>
                <span className="mt-2 self-start rounded-full border border-line bg-background px-3 py-1 text-xs font-semibold text-muted transition-colors group-hover:border-accent/40 group-hover:text-accent">
                  Select →
                </span>
              </button>
            ))}
          </div>

          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-accent">
              Sign in
            </Link>
          </p>
        </section>
      </main>
    );
  }

  // ── Step 2: Signup form ───────────────────────────────────────────────────
  const isPartner = selectedRole === "PARTNER";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-line bg-panel p-6">
        <div className="mb-7">
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-foreground"
          >
            ← Back
          </button>
          <p className="text-xs font-semibold uppercase text-accent">
            {isPartner ? "Partner signup" : "Trader signup"}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            {isPartner ? "Create your partner account" : "Create your trading workspace"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {isPartner
              ? "Submit your application. An admin will review and activate your partner access before you can use the portal."
              : "Enter your details to create your trader account and access the platform."}
          </p>
        </div>

        {referralCode && !isPartner ? (
          <div className="mb-5 rounded-2xl border border-accent-2/20 bg-accent-2/10 px-4 py-3 text-sm font-medium text-accent-2">
            Referral code applied: <span className="font-bold">{referralCode}</span>
          </div>
        ) : null}

        {message ? (
          <div className="mb-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        ) : null}

        <form className="grid gap-4" method="post" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" name="fullName" placeholder="Full name" />
            <TextField label="Email" name="email" type="email" placeholder="name@example.com" />
            <TextField label="Password" name="password" type="password" placeholder="Password" />
            <TextField label="Confirm password" name="confirmPassword" type="password" placeholder="Confirm password" />
          </div>
          {!isPartner ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Referral code (optional)
              </label>
              <input
                name="referralCode"
                value={referralCode}
                onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                placeholder="Enter partner code"
                maxLength={40}
                autoComplete="off"
                className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
              <p className="mt-1.5 text-xs text-muted">
                Codes are checked before account creation and cannot be changed after attribution.
              </p>
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-4">
            <Link href="/login" className="text-sm font-semibold text-accent">
              Already have account
            </Link>
          </div>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Creating..."
              : isPartner
                ? "Submit partner application"
                : "Create account"}
          </PrimaryButton>
        </form>
      </section>
    </main>
  );
}
