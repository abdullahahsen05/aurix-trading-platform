"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Key, ShieldCheck } from "lucide-react";
import { PrimaryButton } from "@/components/app/WorkspaceUI";
import { TextField } from "@/components/app/FormFields";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
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
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      setIsSubmitting(false);
      setError("Passwords do not match.");
      return;
    }

    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password: newPassword });

    setIsSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setMessage("Password updated. Redirecting to login...");
    router.push("/login");
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-line bg-panel p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-accent">Reset password</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Create a new password</h1>
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">
          Use the reset link from your email to set a new password for your trading workspace.
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
          <TextField label="New password" name="newPassword" type="password" placeholder="New password" />
          <TextField label="Confirm password" name="confirmPassword" type="password" placeholder="Confirm password" />
          <div className="flex items-center justify-end gap-4">
            <Link href="/login" className="text-sm font-semibold text-accent">
              Back to login
            </Link>
          </div>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Updating..." : "Update password"}
          </PrimaryButton>
        </form>

        <p className="mt-6 flex items-center gap-2 text-xs text-muted">
          <ShieldCheck className="h-4 w-4 text-accent-2" />
          Reset links are single-use and expire automatically.
        </p>
      </section>
    </main>
  );
}
