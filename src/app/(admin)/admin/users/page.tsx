"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Import, Plus, Search, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { DirectorySearchOverlay } from "@/components/app/DirectorySearchOverlay";
import {
  GhostButton,
  FilterChipRow,
  InlineStatusStrip,
  Panel,
  PageActionGroup,
  PrimaryButton,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { SelectField, TextField } from "@/components/app/FormFields";

type ApiUserRecord = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: "TRADER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  segment: string;
  lastActiveAt: string;
};

function toUserRecord(raw: ApiUserRecord): UserRecord {
  return {
    id: raw.id,
    name: raw.full_name ?? raw.email,
    email: raw.email,
    role: raw.role === "ADMIN" ? "ADMIN" : "TRADER",
    status: raw.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
    segment: raw.role === "ADMIN" ? "OPERATIONS" : "EVALUATION",
    lastActiveAt: raw.created_at,
  };
}

export default function AdminUsersPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [moderationMessage, setModerationMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [profileFilter, setProfileFilter] = useState<"ALL" | "TRADER" | "ADMIN" | "SUSPENDED">("ALL");

  const { data: rawUsers = [], isLoading } = useQuery<ApiUserRecord[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load users");
      return json.data;
    },
  });

  const users: UserRecord[] = useMemo(() => rawUsers.map(toUserRecord), [rawUsers]);

  const filteredUsers = users.filter((user) => {
    if (profileFilter === "ALL") return true;
    if (profileFilter === "SUSPENDED") return user.status === "SUSPENDED";
    return user.role === profileFilter;
  });

  const effectiveSelectedId = selectedId || users[0]?.id || "";
  const selectedUser = filteredUsers.find((user) => user.id === effectiveSelectedId) ?? filteredUsers[0] ?? users[0];

  const handleAddUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setSuccessMessage("");

    window.setTimeout(() => {
      setIsSaving(false);
      setAddOpen(false);
      setSuccessMessage("User created in the admin directory.");
    }, 900);
  };

  const handleImportUsers = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsImporting(true);

    window.setTimeout(() => {
      setIsImporting(false);
      setImportOpen(false);
      setSuccessMessage("CSV import queued in mock mode.");
    }, 900);
  };

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="User management"
      description="Minimal directory shell for large user sets. Search opens in an overlay so the page stays calm."
      action={
        <PageActionGroup>
          <GhostButton type="button" onClick={() => setSearchOpen(true)}>
            <Search className="mr-2 inline-block h-4 w-4" />
            Search
          </GhostButton>
          <Dialog.Root open={importOpen} onOpenChange={setImportOpen}>
            <Dialog.Trigger asChild>
              <GhostButton type="button">
                <Import className="mr-2 inline-block h-4 w-4" />
                Import
              </GhostButton>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
                <Dialog.Title className="text-xl font-semibold text-foreground">Import users</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                  Drop a CSV file here to queue user creation in mock mode.
                </Dialog.Description>
                <form className="mt-6 grid gap-4" onSubmit={handleImportUsers}>
                  <div className="rounded-2xl border border-dashed border-line bg-background p-6 text-center text-sm text-muted">
                    Drop CSV here or click browse
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <p className="text-sm text-muted">This only simulates the upload flow.</p>
                    <div className="flex gap-3">
                      <Dialog.Close asChild>
                        <GhostButton type="button">Cancel</GhostButton>
                      </Dialog.Close>
                      <PrimaryButton type="submit" disabled={isImporting}>
                        {isImporting ? "Importing..." : "Queue import"}
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
          <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
            <Dialog.Trigger asChild>
              <PrimaryButton type="button">
                <Plus className="mr-2 inline-block h-4 w-4" />
                Add user
              </PrimaryButton>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-panel p-6 shadow-[0_20px_60px_rgba(0,0,0,0.48)] focus:outline-none">
                <Dialog.Title className="text-xl font-semibold text-foreground">Add user</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                  Create a trader or admin account and set the initial access profile.
                </Dialog.Description>
                <form className="mt-6 grid gap-4" onSubmit={handleAddUser}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField label="Full name" defaultValue="New User" />
                    <TextField label="Email" defaultValue="new.user@example.com" />
                    <SelectField label="Role" defaultValue="TRADER">
                      <option value="TRADER">Trader</option>
                      <option value="ADMIN">Admin</option>
                    </SelectField>
                    <SelectField label="Status" defaultValue="ACTIVE">
                      <option value="ACTIVE">Active</option>
                      <option value="SUSPENDED">Suspended</option>
                    </SelectField>
                  </div>
                  <TextField label="Segment" defaultValue="EVALUATION" />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <p className="text-sm text-muted">
                      Users stay in the directory until the auth layer is connected.
                    </p>
                    <div className="flex gap-3">
                      <Dialog.Close asChild>
                        <GhostButton type="button">Cancel</GhostButton>
                      </Dialog.Close>
                      <PrimaryButton type="submit" disabled={isSaving}>
                        {isSaving ? "Creating..." : "Create user"}
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
          { label: "Total users", value: isLoading ? "..." : users.length },
          { label: "Admins", value: users.filter((user) => user.role === "ADMIN").length, tone: "accent" },
          { label: "Traders", value: users.filter((user) => user.role === "TRADER").length, tone: "lime" },
          { label: "Suspended", value: users.filter((user) => user.status === "SUSPENDED").length },
        ]}
      />

      <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
        <FilterChipRow
          chips={[
            {
              label: `All profiles (${users.length})`,
              active: profileFilter === "ALL",
              onClick: () => {
                setProfileFilter("ALL");
                setSelectedId(users[0]?.id ?? "");
              },
            },
            {
              label: `Traders (${users.filter((user) => user.role === "TRADER").length})`,
              active: profileFilter === "TRADER",
              onClick: () => {
                setProfileFilter("TRADER");
                setSelectedId(users.find((user) => user.role === "TRADER")?.id ?? users[0]?.id ?? "");
              },
            },
            {
              label: `Admins (${users.filter((user) => user.role === "ADMIN").length})`,
              active: profileFilter === "ADMIN",
              onClick: () => {
                setProfileFilter("ADMIN");
                setSelectedId(users.find((user) => user.role === "ADMIN")?.id ?? users[0]?.id ?? "");
              },
            },
            {
              label: `Suspended (${users.filter((user) => user.status === "SUSPENDED").length})`,
              active: profileFilter === "SUSPENDED",
              onClick: () => {
                setProfileFilter("SUSPENDED");
                setSelectedId(users.find((user) => user.status === "SUSPENDED")?.id ?? users[0]?.id ?? "");
              },
            },
          ]}
        />
      </div>

      {successMessage ? (
        <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {successMessage}
        </div>
      ) : null}

      {moderationMessage ? (
        <div className="mt-3 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {moderationMessage}
        </div>
      ) : null}

      {selectedUser ? (
        <div className="mt-5">
          <Panel className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Selected profile</p>
                <h2 className="mt-2 text-lg font-semibold text-foreground">{selectedUser.name}</h2>
                <p className="mt-1 text-sm text-muted">{selectedUser.email}</p>
              </div>
              <StatusPill tone={selectedUser.role === "ADMIN" ? "accent" : "lime"}>{selectedUser.role}</StatusPill>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Status</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{selectedUser.status}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Segment</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{selectedUser.segment}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Last active</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{new Date(selectedUser.lastActiveAt).toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Access</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Workspace enabled</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <GhostButton
                type="button"
                onClick={() => setModerationMessage(`${selectedUser.name} marked for suspension review.`)}
              >
                Suspend review
              </GhostButton>
            </div>
          </Panel>
        </div>
      ) : isLoading ? (
        <div className="mt-5 rounded-2xl border border-line bg-panel p-8 text-center text-sm text-muted">
          Loading users...
        </div>
      ) : null}

      <DirectorySearchOverlay<UserRecord>
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Find users"
        description="Search and filter stay inside the overlay so the page shell stays minimal."
        items={users}
        selectedId={effectiveSelectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setSearchOpen(false);
        }}
        searchLabel="Search users"
        searchPlaceholder="Search by name, email, or segment"
        filters={[
          {
            key: "role",
            label: "Role",
            options: [
              { value: "ALL", label: "All roles" },
              { value: "TRADER", label: "Trader" },
              { value: "ADMIN", label: "Admin" },
            ],
          },
          {
            key: "status",
            label: "Status",
            options: [
              { value: "ALL", label: "All statuses" },
              { value: "ACTIVE", label: "Active" },
              { value: "SUSPENDED", label: "Suspended" },
            ],
          },
        ]}
        emptyTitle="No users match"
        emptyDescription="Adjust the search term or filter values."
        getId={(user) => user.id}
        matches={(user, state) => {
          const search = state.query.trim().toLowerCase();
          const matchesQuery =
            search.length === 0 ||
            user.name.toLowerCase().includes(search) ||
            user.email.toLowerCase().includes(search) ||
            user.segment.toLowerCase().includes(search);
          const matchesRole = state.filters.role === "ALL" || user.role === state.filters.role;
          const matchesStatus = state.filters.status === "ALL" || user.status === state.filters.status;
          return matchesQuery && matchesRole && matchesStatus;
        }}
        renderRow={(user) => (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                <p className="mt-1 truncate text-xs text-muted">{user.email}</p>
              </div>
              <StatusPill tone={user.role === "ADMIN" ? "accent" : "lime"}>{user.role}</StatusPill>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-muted">
                {user.segment}
              </span>
              <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-muted">
                {new Date(user.lastActiveAt).toLocaleDateString()}
              </span>
            </div>
          </>
        )}
        renderPreview={(user) => (
          <Panel className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Profile preview</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{user.name}</h3>
                <p className="mt-1 text-sm text-muted">{user.email}</p>
              </div>
              <StatusPill tone={user.role === "ADMIN" ? "accent" : "lime"}>{user.role}</StatusPill>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Segment</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{user.segment}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Status</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{user.status}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Last active</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{new Date(user.lastActiveAt).toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Access</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Workspace ready</p>
              </div>
            </div>
          </Panel>
        )}
      />
    </WorkspacePage>
  );
}
