"use client";

import { useMemo, useState } from "react";
import { EmptyState, GhostButton, InlineStatusStrip, Panel, StatusPill, WorkspacePage } from "@/components/app/WorkspaceUI";
import { CrmOverlay } from "@/components/crm/CrmOverlay";
import { NoteEditorDialog } from "@/components/crm/NoteEditorDialog";
import type { CrmContact, CrmNoteItem, CrmRoleFilter, CrmSegmentFilter, CrmTab } from "@/components/crm/crmTypes";
import { crmNotes, traders } from "@/lib/data/mockData";

type Contact = CrmContact;

const crmTabs: Array<{ key: CrmTab; label: string }> = [
  { key: "CONTACT_DIRECTORY", label: "Contacts" },
  { key: "PROFILE_DETAIL", label: "Profile" },
  { key: "BILLING", label: "Billing" },
  { key: "ACTIVITY", label: "Activity" },
];

function tabButtonClass(active: boolean) {
  return `btn-dark h-9 px-4 text-xs ${active ? "btn-active" : ""}`;
}

function buildContacts(): Contact[] {
  const ayan = traders.find((trader) => trader.traderId === "trader-001");
  const sara = traders.find((trader) => trader.traderId === "trader-002");

  return [
    {
      id: "trader-001",
      name: ayan?.name ?? "Ayan Malik",
      email: ayan?.email ?? "ayan@example.com",
      role: "TRADER",
      segment: ayan?.segment ?? "FUNDED",
      status: "ACTIVE",
      team: "Funding desk",
      accountIds: ["acc-orion-001"],
      assignedTraders: [],
      subscription: "Funded Pro",
      lastActivityAt: ayan?.lastActivityAt ?? "2026-05-11T11:00:00.000Z",
      tags: ["Top performer", "Low drawdown"],
    },
    {
      id: "trader-002",
      name: sara?.name ?? "Sara Khan",
      email: sara?.email ?? "sara@example.com",
      role: "TRADER",
      segment: sara?.segment ?? "AT_RISK",
      status: "AT_RISK",
      team: "Evaluation desk",
      accountIds: ["acc-nova-002"],
      assignedTraders: [],
      subscription: "Evaluation",
      lastActivityAt: sara?.lastActivityAt ?? "2026-05-11T09:00:00.000Z",
      tags: ["Monitoring", "Needs review"],
    },
    {
      id: "user-maya-001",
      name: "Maya Sterling",
      email: "maya@platform.local",
      role: "PLATFORM_USER",
      segment: "OPERATIONS",
      status: "ACTIVE",
      team: "Customer Success",
      accountIds: [],
      assignedTraders: ["Ayan Malik", "Sara Khan"],
      subscription: "Workspace Seat",
      lastActivityAt: "2026-05-11T14:12:00.000Z",
      tags: ["Onboarding", "Retention"],
    },
    {
      id: "user-noah-001",
      name: "Noah Bennett",
      email: "noah@platform.local",
      role: "PLATFORM_USER",
      segment: "RISK",
      status: "ACTIVE",
      team: "Risk Desk",
      accountIds: [],
      assignedTraders: ["Sara Khan"],
      subscription: "Workspace Seat",
      lastActivityAt: "2026-05-11T15:45:00.000Z",
      tags: ["Review queue", "Escalations"],
    },
  ];
}

const crmContacts = buildContacts();

const platformNotes: Record<string, CrmNoteItem[]> = {
  "user-maya-001": [
    {
      id: "maya-note-1",
      authorName: "Support Lead",
      note: "Reviewed onboarding queue and confirmed account linkage health.",
      createdAt: "2026-05-11T14:10:00.000Z",
    },
    {
      id: "maya-note-2",
      authorName: "Compliance",
      note: "Customer segmentation rules are current for funded traders.",
      createdAt: "2026-05-11T09:30:00.000Z",
    },
  ],
  "user-noah-001": [
    {
      id: "noah-note-1",
      authorName: "Risk Desk",
      note: "Checked open alerts and updated the supervision queue.",
      createdAt: "2026-05-11T15:45:00.000Z",
    },
    {
      id: "noah-note-2",
      authorName: "Platform Admin",
      note: "Validated account tracking coverage for broker-linked profiles.",
      createdAt: "2026-05-11T08:05:00.000Z",
    },
  ],
};

export default function AdminCrmPage() {
  const [selectedId, setSelectedId] = useState(crmContacts[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<CrmRoleFilter>("ALL");
  const [segmentFilter, setSegmentFilter] = useState<CrmSegmentFilter>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeOverlay, setActiveOverlay] = useState<CrmTab | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const pageSize = 10;

  const filteredContacts = useMemo(() => {
    const search = query.trim().toLowerCase();
    return crmContacts.filter((contact) => {
      const matchesQuery =
        search.length === 0 ||
        contact.name.toLowerCase().includes(search) ||
        contact.email.toLowerCase().includes(search) ||
        contact.team.toLowerCase().includes(search);
      const matchesRole = roleFilter === "ALL" || contact.role === roleFilter;
      const matchesSegment = segmentFilter === "ALL" || contact.segment === segmentFilter;
      return matchesQuery && matchesRole && matchesSegment;
    });
  }, [query, roleFilter, segmentFilter]);

  const totalContacts = filteredContacts.length;
  const totalPages = Math.max(1, Math.ceil(totalContacts / pageSize));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const startIndex = (currentPageSafe - 1) * pageSize;
  const visibleContacts = filteredContacts.slice(startIndex, startIndex + pageSize);

  const selectedContact = filteredContacts.find((contact) => contact.id === selectedId) ?? null;
  const selectedNotes: CrmNoteItem[] = selectedContact
    ? selectedContact.role === "TRADER"
      ? crmNotes.filter((note) => note.traderId === selectedContact.id)
      : platformNotes[selectedContact.id] ?? []
    : [];
  const recentNotes = selectedNotes.slice(0, 3);

  return (
    <WorkspacePage
      eyebrow="Admin console"
      title="CRM"
      description="Centralized management system for all traders and platform users."
    >
      <Panel>
        <div className="flex flex-wrap gap-3">
          {crmTabs.map((tab) => {
            const active = activeOverlay === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveOverlay(tab.key)}
                className={tabButtonClass(active)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </Panel>

      <InlineStatusStrip
        items={[
          { label: "Profiles", value: crmContacts.length },
          {
            label: "Traders",
            value: crmContacts.filter((contact) => contact.role === "TRADER").length,
            tone: "lime",
          },
          {
            label: "Platform users",
            value: crmContacts.filter((contact) => contact.role === "PLATFORM_USER").length,
            tone: "accent",
          },
          { label: "Active subscriptions", value: "2", tone: "lime" },
        ]}
      />

          {feedbackMessage ? (
        <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {feedbackMessage}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        <Panel>
          {selectedContact ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Selected profile</p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">{selectedContact.name}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{selectedContact.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={selectedContact.status === "AT_RISK" ? "danger" : "lime"}>
                    {selectedContact.status === "AT_RISK" ? "At risk" : "Active"}
                  </StatusPill>
                  <StatusPill tone={selectedContact.role === "TRADER" ? "lime" : "accent"}>
                    {selectedContact.role === "TRADER" ? "Trader" : "Platform user"}
                  </StatusPill>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-line bg-background px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Segment</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{selectedContact.segment}</p>
                </div>
                <div className="rounded-2xl border border-line bg-background px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Team</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{selectedContact.team}</p>
                </div>
                <div className="rounded-2xl border border-line bg-background px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Linked accounts</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{selectedContact.accountIds.length}</p>
                </div>
                <div className="rounded-2xl border border-line bg-background px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Subscription</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{selectedContact.subscription}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedContact.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-muted">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                  Last active - {new Date(selectedContact.lastActivityAt).toLocaleString()}
                </p>
                <GhostButton type="button" onClick={() => setActiveOverlay("PROFILE_DETAIL")}>
                  Open full profile
                </GhostButton>
              </div>
            </>
          ) : (
            <EmptyState
              title="Select a profile"
              description="Choose a contact from the directory to show the CRM preview."
              action={
                <GhostButton type="button" onClick={() => setActiveOverlay("CONTACT_DIRECTORY")}>
                  Open directory
                </GhostButton>
              }
            />
          )}
        </Panel>

        <Panel>
          {selectedContact ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Recent activity</p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">{selectedContact.name}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">Latest notes and CRM updates.</p>
                </div>
                <GhostButton type="button" onClick={() => setActiveOverlay("ACTIVITY")}>
                  Open activity
                </GhostButton>
              </div>

              <div className="mt-4 space-y-3">
                {recentNotes.length === 0 ? (
                  <EmptyState
                    title="No notes yet"
                    description="This profile does not have any CRM notes."
                  />
                ) : (
                  recentNotes.map((note) => (
                    <div key={note.id} className="rounded-2xl border border-line bg-background p-4">
                      <p className="text-sm leading-6 text-foreground">{note.note}</p>
                      <p className="mt-2 text-xs text-muted">
                        {note.authorName} - {new Date(note.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <EmptyState
              title="No activity to show"
              description="Pick a contact to surface notes and activity history."
              action={
                <GhostButton type="button" onClick={() => setActiveOverlay("CONTACT_DIRECTORY")}>
                  Open directory
                </GhostButton>
              }
            />
          )}
        </Panel>
      </div>

      <CrmOverlay
        open={activeOverlay !== null}
        activeTab={activeOverlay}
        onOpenChange={(open) => {
          if (!open) {
            setActiveOverlay(null);
          }
        }}
        onTabChange={setActiveOverlay}
        contacts={crmContacts}
        selectedContact={selectedContact}
        selectedId={selectedId}
        onSelectContact={setSelectedId}
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setCurrentPage(1);
        }}
        roleFilter={roleFilter}
        onRoleFilterChange={(value) => {
          setRoleFilter(value);
          setCurrentPage(1);
        }}
        segmentFilter={segmentFilter}
        onSegmentFilterChange={(value) => {
          setSegmentFilter(value);
          setCurrentPage(1);
        }}
        currentPage={currentPageSafe}
        pageSize={pageSize}
        totalContacts={totalContacts}
        visibleContacts={visibleContacts}
        onCurrentPageChange={setCurrentPage}
        selectedNotes={selectedNotes}
        onOpenNoteEditor={() => setNoteOpen(true)}
        onFeedbackMessage={setFeedbackMessage}
      />

      <NoteEditorDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        selectedName={selectedContact?.name ?? ""}
        onSave={setFeedbackMessage}
      />
    </WorkspacePage>
  );
}
