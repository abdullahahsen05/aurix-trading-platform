"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CalendarPlus, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  DataTable,
  EmptyState,
  GhostButton,
  InlineStatusStrip,
  Panel,
  PageActionGroup,
  PrimaryButton,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { SelectField, TextField, TextAreaField } from "@/components/app/FormFields";

export default function ReportsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const reports = [
    ["Monthly Performance", "May 2026", "Ready", "PDF + Excel"],
    ["Risk Review", "Week 19", "Draft", "PDF"],
    ["Challenge Summary", "Phase 2", "Ready", "PDF"],
  ];

  const handleCreateReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSuccessMessage("");

    window.setTimeout(() => {
      setIsSubmitting(false);
      setCreateOpen(false);
      setSuccessMessage("Report packet queued. The export will be available in the reports table.");
    }, 1000);
  };

  const handleScheduleReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsScheduling(true);
    setSuccessMessage("");

    window.setTimeout(() => {
      setIsScheduling(false);
      setScheduleOpen(false);
      const nextDelivery = new Date();
      nextDelivery.setDate(nextDelivery.getDate() + 1);
      setSuccessMessage(`Scheduled. First delivery ${nextDelivery.toLocaleDateString()} at 09:00.`);
    }, 900);
  };

  return (
    <WorkspacePage
      eyebrow="Reports"
      title="Export-ready reporting"
      description="Client-ready performance packets, risk summaries, and account review exports."
      action={
        <PageActionGroup>
          <Dialog.Root open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <Dialog.Trigger asChild>
              <GhostButton type="button">
                <CalendarPlus className="mr-2 inline-block h-4 w-4" />
                Schedule
              </GhostButton>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
                <Dialog.Title className="text-xl font-semibold text-foreground">Schedule report</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                  Pick a cadence and delivery time. This is a mock scheduling flow for the UI review.
                </Dialog.Description>
                <form className="mt-6 grid gap-4" onSubmit={handleScheduleReport}>
                  <SelectField label="Cadence" defaultValue="Weekly">
                    <option>Daily</option>
                    <option>Weekly</option>
                    <option>Monthly</option>
                  </SelectField>
                  <TextField label="Delivery time" defaultValue="09:00" />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <p className="text-sm text-muted">The next delivery will be queued in mock mode.</p>
                    <div className="flex gap-3">
                      <Dialog.Close asChild>
                        <GhostButton type="button">Cancel</GhostButton>
                      </Dialog.Close>
                      <PrimaryButton type="submit" disabled={isScheduling}>
                        {isScheduling ? "Scheduling..." : "Schedule"}
                      </PrimaryButton>
                    </div>
                  </div>
                </form>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close dialog"
                    className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-line bg-background text-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
            <Dialog.Trigger asChild>
              <PrimaryButton type="button">
                <Plus className="mr-2 inline-block h-4 w-4" />
                Create report
              </PrimaryButton>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
                <Dialog.Title className="text-xl font-semibold text-foreground">Create report packet</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                  Configure the report scope, delivery format, and notes for the final export.
                </Dialog.Description>
                <form className="mt-6 grid gap-4" onSubmit={handleCreateReport}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField label="Report name" defaultValue="Monthly Performance" />
                    <SelectField label="Period" defaultValue="May 2026">
                      <option>May 2026</option>
                      <option>Week 19</option>
                      <option>Phase 2</option>
                    </SelectField>
                    <SelectField label="Format" defaultValue="PDF">
                      <option>PDF</option>
                      <option>Excel</option>
                      <option>PDF + Excel</option>
                    </SelectField>
                    <SelectField label="Audience" defaultValue="Client">
                      <option>Client</option>
                      <option>Risk desk</option>
                      <option>Admin team</option>
                    </SelectField>
                  </div>
                  <TextAreaField
                    label="Notes"
                    defaultValue="Include summary, equity curve, closed trades, and rule breaches."
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <p className="text-sm text-muted">
                      Reports are queued against the mock export flow until backend delivery is connected.
                    </p>
                    <div className="flex gap-3">
                      <Dialog.Close asChild>
                        <GhostButton type="button">Cancel</GhostButton>
                      </Dialog.Close>
                      <PrimaryButton type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Creating..." : "Create report"}
                      </PrimaryButton>
                    </div>
                  </div>
                </form>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close dialog"
                    className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-line bg-background text-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </PageActionGroup>
      }
    >
      <InlineStatusStrip
        items={[
          { label: "Ready reports", value: "2", helper: "Available for export", tone: "lime" },
          { label: "Draft reports", value: "1", helper: "Needs review", tone: "accent" },
          { label: "Export formats", value: "PDF / XLSX", helper: "Future backend export service" },
        ]}
      />

      {successMessage ? (
        <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {successMessage}
        </div>
      ) : null}

      <div className="mt-5">
        <DataTable headers={["Report", "Period", "Status", "Format"]} rows={reports} />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[0.62fr_0.38fr]">
        <Panel>
          <h2 className="text-lg font-semibold text-foreground">Report preview structure</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Final reports will include account summary, equity curve, closed trades, rule breaches,
            consistency metrics, and admin notes.
          </p>
        </Panel>
        <Panel>
          <h2 className="text-lg font-semibold text-foreground">Delivery queue</h2>
          <div className="mt-4 space-y-3">
            <EmptyState
              title="No queued deliveries yet"
              description="Create a report packet to populate the delivery queue and download actions."
            />
          </div>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
