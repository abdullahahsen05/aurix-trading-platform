"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { GhostButton, PrimaryButton } from "@/components/app/WorkspaceUI";
import { startAuthentication } from "@simplewebauthn/browser";
import { TextField } from "@/components/app/FormFields";
import { createClient } from "@/lib/supabase/client";
import { parseUserRole, type UserRole } from "@/lib/auth/rbac";
import { roleHome } from "@/lib/auth/routeAccess";
import { BRAND_INITIAL, BRAND_WORDMARK } from "@/lib/brand";

export default function LoginPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setIsSubmitting(false);
      setError(authError.message);
      return;
    }

    // Fetch profile to determine role
    const { data: { user } } = await supabase.auth.getUser();
    let role: UserRole | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      role = parseUserRole(profile?.role);
    }

    if (!role) {
      await supabase.auth.signOut();
      setIsSubmitting(false);
      setError("Your account profile is incomplete. Contact support before signing in.");
      return;
    }

    setMessage("Signed in successfully. Redirecting...");
    router.replace(roleHome(role));
    router.refresh();
  };

  const handlePasskeySignIn = async () => {
    setIsSubmitting(true);
    setMessage("");
    setError("");
    try {
      const optionsResponse = await fetch("/api/auth/passkeys/login/options", { method: "POST" });
      const optionsJson = await optionsResponse.json();
      if (!optionsJson.ok) throw new Error(optionsJson.error?.message ?? "Passkey sign-in is unavailable");
      const response = await startAuthentication({ optionsJSON: optionsJson.data.options });
      const verifyResponse = await fetch("/api/auth/passkeys/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: optionsJson.data.challengeId, response }),
      });
      const verifyJson = await verifyResponse.json();
      if (!verifyJson.ok) throw new Error(verifyJson.error?.message ?? "Passkey sign-in failed");
      setMessage("Signed in with passkey. Redirecting...");
      router.replace(verifyJson.data.redirectTo ?? "/dashboard");
      router.refresh();
    } catch (passkeyError) {
      setError(passkeyError instanceof Error ? passkeyError.message : "Passkey sign-in failed");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-line bg-panel p-6">
        <div className="mb-7">
          <div className="mb-5 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-accent text-sm font-black text-background">
              {BRAND_INITIAL}
            </span>
            <span className="text-xl font-semibold text-foreground">{BRAND_WORDMARK}</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Sign in to review accounts, trades, CRM, risk, and admin operations.
          </p>
        </div>

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
          <TextField label="Email" name="email" type="email" />
          <TextField label="Password" name="password" type="password" />
          <div className="flex items-center justify-end gap-4">
            <Link href="/forgot-password" className="text-sm font-semibold text-accent">
              Forgot password?
            </Link>
          </div>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </PrimaryButton>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
        <GhostButton type="button" disabled={isSubmitting} onClick={handlePasskeySignIn}>
          Sign in with passkey
        </GhostButton>

        <div className="mt-4 rounded-2xl border border-line bg-background p-4">
          <p className="text-sm font-semibold text-foreground">Explore the platform first</p>
          <p className="mt-1 text-sm text-muted">
            Open the public demo workspace with sample data only. No broker sync, real trading, or paid access is triggered.
          </p>
          <Link href="/demo" className="btn-dark mt-3 inline-flex">
            View Demo
          </Link>
        </div>

        <p className="mt-6 text-sm text-muted">
          New trader?{" "}
          <Link href="/register" className="font-semibold text-accent">
            Create account
          </Link>
        </p>
      </section>
    </main>
  );
}
