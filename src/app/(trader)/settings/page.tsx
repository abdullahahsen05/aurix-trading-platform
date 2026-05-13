"use client";

import { useState, type FormEvent } from "react";
import { GhostButton, Panel, PrimaryButton, WorkspacePage } from "@/components/app/WorkspaceUI";
import { SelectField, TextField } from "@/components/app/FormFields";

export default function SettingsPage() {
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setSuccessMessage("");

    window.setTimeout(() => {
      setIsSaving(false);
      setSuccessMessage("Profile settings saved. Broker connection preferences updated in mock mode.");
    }, 900);
  };

  return (
    <WorkspacePage
      eyebrow="Settings"
      title="Profile and broker configuration"
      description="Trader profile, security settings, broker server details, and investor-password connection preferences."
      action={
        <PrimaryButton type="submit" form="settings-form" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save changes"}
        </PrimaryButton>
      }
    >
      {successMessage ? (
        <div className="mb-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {successMessage}
        </div>
      ) : null}
      <form id="settings-form" onSubmit={handleSave} className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <h2 className="text-lg font-semibold text-foreground">Profile</h2>
          <div className="mt-5 grid gap-4">
            <TextField label="Display name" defaultValue="Ayan Malik" />
            <TextField label="Email address" defaultValue="ayan@example.com" />
            <SelectField label="Timezone" defaultValue="Asia/Karachi">
              <option>Asia/Karachi</option>
              <option>Europe/London</option>
              <option>America/New_York</option>
            </SelectField>
          </div>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">Broker access</h2>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-background px-4 py-3 text-sm font-medium text-muted">
            Mock mode is active while broker access remains UI-only.
          </div>
          <div className="mt-5 grid gap-4">
            <TextField label="Broker server" placeholder="Broker server name" />
            <TextField label="MT5 login" placeholder="Account login" />
            <TextField label="Investor password" type="password" placeholder="Password" />
          </div>
          <div className="mt-5 flex gap-3">
            <GhostButton type="button">Test connection</GhostButton>
            <PrimaryButton type="submit" disabled={isSaving}>
              {isSaving ? "Connecting..." : "Connect"}
            </PrimaryButton>
          </div>
        </Panel>
      </form>
    </WorkspacePage>
  );
}
