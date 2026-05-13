"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PrimaryButton } from "@/components/app/WorkspaceUI";
import { TextField } from "@/components/app/FormFields";

export default function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    window.setTimeout(() => {
      setIsSubmitting(false);
      setMessage("Reset link prepared. Check the inbox once auth delivery is connected.");
    }, 900);
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

        <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
          <TextField label="Email" placeholder="name@example.com" />
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
