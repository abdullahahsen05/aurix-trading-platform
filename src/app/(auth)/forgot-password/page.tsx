"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PrimaryButton } from "@/components/app/WorkspaceUI";
import { TextField } from "@/components/app/FormFields";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.NEXT_PUBLIC_SITE_URL + "/reset-password",
    });

    setIsSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setMessage("Reset link sent. Check your inbox to continue.");
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-line bg-panel p-6">
        <p className="text-xs font-semibold uppercase text-accent">Recovery</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Forgot password</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Enter your email and we will prepare a secure reset flow once auth is connected.
        </p>

        {message ? (
          <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        ) : null}

        <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
          <TextField label="Email" name="email" type="email" placeholder="name@example.com" />
          <div className="flex items-center justify-between gap-4">
            <Link href="/login" className="text-sm font-semibold text-accent">
              Back to login
            </Link>
            <PrimaryButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Send reset link"}
            </PrimaryButton>
          </div>
        </form>
      </section>
    </main>
  );
}
