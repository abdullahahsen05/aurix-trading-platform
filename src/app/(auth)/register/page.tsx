"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/app/WorkspaceUI";
import { SelectField, TextField } from "@/components/app/FormFields";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
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
    const fullName = formData.get("fullName") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setIsSubmitting(false);
      setError("Passwords do not match.");
      return;
    }

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (authError) {
      setIsSubmitting(false);
      setError(authError.message);
      return;
    }

    setMessage("Account created. Redirecting to workspace...");
    router.push("/dashboard");
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-line bg-panel p-6">
        <div className="mb-7">
          <p className="text-xs font-semibold uppercase text-accent">Trader signup</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Create your trading workspace</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Enter your details to create your trader account and access the dashboard.
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
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" name="fullName" placeholder="Full name" />
            <TextField label="Email" name="email" type="email" placeholder="name@example.com" />
            <TextField label="Password" name="password" type="password" placeholder="Password" />
            <TextField label="Confirm password" name="confirmPassword" type="password" placeholder="Confirm password" />
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
