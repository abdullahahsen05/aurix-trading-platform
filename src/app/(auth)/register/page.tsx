"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PrimaryButton } from "@/components/app/WorkspaceUI";
import { SelectField, TextField } from "@/components/app/FormFields";

export default function RegisterPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    window.setTimeout(() => {
      setIsSubmitting(false);
      setMessage("Account created in mock mode. Verification email queued.");
    }, 900);
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-line bg-panel p-6">
        <div className="mb-7">
          <p className="text-xs font-semibold uppercase text-accent">Trader signup</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Create your trading workspace</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Registration screen is UI-ready and will connect to real auth in the backend phase.
          </p>
        </div>

        {message ? (
          <div className="mb-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
            {message}
          </div>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" placeholder="Full name" />
            <TextField label="Email" placeholder="name@example.com" />
            <TextField label="Password" type="password" placeholder="Password" />
            <TextField label="Confirm password" type="password" placeholder="Confirm password" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Account type" defaultValue="TRADER">
              <option value="TRADER">Trader</option>
              <option value="ADMIN">Admin</option>
            </SelectField>
            <SelectField label="Timezone" defaultValue="Asia/Karachi">
              <option>Asia/Karachi</option>
              <option>Europe/London</option>
              <option>America/New_York</option>
            </SelectField>
          </div>
          <div className="flex items-center justify-end gap-4">
            <Link href="/login" className="text-sm font-semibold text-accent">
              Already have account
            </Link>
          </div>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create account"}
          </PrimaryButton>
        </form>
      </section>
    </main>
  );
}
