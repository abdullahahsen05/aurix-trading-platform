"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/app/WorkspaceUI";
import { TextField } from "@/components/app/FormFields";
import { createClient } from "@/lib/supabase/client";

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
    let role = "TRADER";
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      role = profile?.role ?? "TRADER";
    }

    setMessage("Signed in successfully. Redirecting...");
    const home = role === "ADMIN" ? "/admin" : role === "PARTNER" ? "/partner" : "/dashboard";
    router.push(home);
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-line bg-panel p-6">
        <div className="mb-7">
          <div className="mb-5 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-accent text-sm font-black text-background">
              A
            </span>
            <span className="text-xl font-semibold text-foreground">AURIX</span>
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

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <TextField label="Email" name="email" type="email" defaultValue="ayan@example.com" />
          <TextField label="Password" name="password" type="password" defaultValue="password" />
          <div className="flex items-center justify-end gap-4">
            <Link href="/forgot-password" className="text-sm font-semibold text-accent">
              Forgot password?
            </Link>
          </div>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </PrimaryButton>
        </form>

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
