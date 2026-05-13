"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PrimaryButton } from "@/components/app/WorkspaceUI";
import { TextField } from "@/components/app/FormFields";

export default function LoginPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    window.setTimeout(() => {
      setIsSubmitting(false);
      setMessage("Signed in successfully. Redirecting to the trading workspace.");
    }, 900);
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

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <TextField label="Email" defaultValue="ayan@example.com" />
          <TextField label="Password" type="password" defaultValue="password" />
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
