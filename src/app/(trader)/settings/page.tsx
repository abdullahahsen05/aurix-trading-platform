"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GhostButton, Panel, PrimaryButton, WorkspacePage } from "@/components/app/WorkspaceUI";
import { SelectField, TextField } from "@/components/app/FormFields";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const { data: sessionUser } = useQuery<SessionUser>({
    queryKey: ["session"],
    queryFn: async () => {
      const res = await fetch("/api/auth/session");
      const json = await res.json();
      if (!json.ok) throw new Error("Failed to load session");
      return json.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: { fullName: string; timezone: string }) => {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to save");
      return json.data;
    },
    onSuccess: () => {
      setSuccessMessage("Profile settings saved successfully.");
      setErrorMessage("");
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (err: Error) => {
      setErrorMessage(err.message);
      setSuccessMessage("");
    },
  });

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      fullName: form.get("fullName") as string,
      timezone: form.get("timezone") as string,
    });
  };

  return (
    <WorkspacePage
      eyebrow="Settings"
      title="Profile and broker configuration"
      description="Trader profile, security settings, broker server details, and investor-password connection preferences."
      action={
        <PrimaryButton type="submit" form="settings-form" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : "Save changes"}
        </PrimaryButton>
      }
    >
      {successMessage ? (
        <div className="mb-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {successMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-5 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {errorMessage}
        </div>
      ) : null}
      <form id="settings-form" onSubmit={handleSave} className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <h2 className="text-lg font-semibold text-foreground">Profile</h2>
          <div className="mt-5 grid gap-4">
            <TextField
              label="Display name"
              name="fullName"
              defaultValue={sessionUser?.name ?? ""}
              key={`name-${sessionUser?.id}`}
            />
            <TextField
              label="Email address"
              name="email"
              defaultValue={sessionUser?.email ?? ""}
              disabled
            />
            <SelectField label="Timezone" name="timezone" defaultValue="Asia/Karachi">
              <option value="Asia/Karachi">Asia/Karachi</option>
              <option value="Europe/London">Europe/London</option>
              <option value="America/New_York">America/New_York</option>
            </SelectField>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-background px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Role</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{sessionUser?.role ?? "—"}</p>
          </div>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">Broker access</h2>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-background px-4 py-3 text-sm font-medium text-muted">
            Broker API credentials are managed by your platform administrator.
          </div>
          <div className="mt-5 grid gap-4">
            <TextField label="Broker server" name="brokerServer" placeholder="e.g. FusionMarkets-Live" />
            <TextField label="MT5 login" name="mt5Login" placeholder="Account login number" />
            <TextField label="Investor password" name="investorPassword" type="password" placeholder="Read-only password" />
          </div>
          <div className="mt-5 flex gap-3">
            <GhostButton type="button">Test connection</GhostButton>
            <PrimaryButton type="button">Connect</PrimaryButton>
          </div>
        </Panel>
      </form>
    </WorkspacePage>
  );
}
