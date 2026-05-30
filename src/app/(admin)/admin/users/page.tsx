"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Import, Plus, Search, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DirectorySearchOverlay } from "@/components/app/DirectorySearchOverlay";
import {
  EmptyState,
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
  status: "ACTIVE" | "SUSPENDED" | "PENDING";
  segment: string;
  lastActiveAt: string;
};

function toUserRecord(raw: ApiUserRecord): UserRecord {
  return {
    id: raw.id,
    name: raw.full_name ?? raw.email,
    email: raw.email,
    role: raw.role === "ADMIN" ? "ADMIN" : "TRADER",
    // Preserve all three statuses — do not collapse PENDING → ACTIVE
    status: (["ACTIVE", "SUSPENDED", "PENDING"] as const).includes(raw.status as "ACTIVE" | "SUSPENDED" | "PENDING")
      ? (raw.status as "ACTIVE" | "SUSPENDED" | "PENDING")
      : "ACTIVE",
    segment: raw.role === "ADMIN" ? "OPERATIONS" : "EVALUATION",
    lastActiveAt: raw.created_at,
  };
}

const STATUS_TONE: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  ACTIVE: "lime",
  PENDING: "accent",
  SUSPENDED: "danger",
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [profileFilter, setProfileFilter] = useState<"ALL" | "TRADER" | "ADMIN" | "SUSPENDED" | "PENDING">("ALL");

  const { data: rawUsers = [], isLoading, isError } = useQuery<ApiUserRecord[]>({
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
    if (profileFilter === "PENDING") return user.status === "PENDING";
    return user.role === profileFilter;
  });

  const effectiveSelectedId = selectedId || users[0]?.id || "";
  const selectedUser =
    filteredUsers.find((u) => u.id === effectiveSelectedId) ??
    filteredUsers[0] ??
    users[0];

  // ── Real status change mutation ─────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: async ({
      userId,
      status,
    }: {
      userId: string;
      status: "ACTIVE" | "SUSPENDED" | "PENDING";
    }) => {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update status");
      return json.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setNotice({
        type: "success",
        text: `User status updated to ${variables.status}.`,
      });
    },
    onError: (err: Error) => {
      setNotice({ type: "error", text: err.message });
    },
  });

  const handleStatusChange = (
    userId: string,
    newStatus: "ACTIVE" | "SUSPENDED" | "PENDING"
  ) => {
    setNotice(null);
    statusMutation.mutate({ userId, status: newStatus });
  };

  // ── Add user (UI stub — Phase 3 will implement Supabase admin auth invite) ──
  const handleAddUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);
    window.setTimeout(() => {
      setIsSaving(false);
      setAddOpen(false);
      setNotice({
        type: "success",
        text: "Invite flow will be wired in Phase 3 (Supabase admin auth).",
      });
    }, 400);
  };

  // ── Import (stub — Phase 3) ───────────────────────────────────────────────
  const handleImportUsers = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsImporting(true);
    window.setTimeout(() => {
      setIsImporting(false);
      setImportOpen(false);
      setNotice({ type: "success", text: "CSV import will be wired in Phase 3." });
    }, 400);
  };

  const pendingCount = users.filter((u) => u.status === "PENDING").length;
  const suspendedCount = users.filter((u) => u.status === "SUSPENDED").length;

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="User management"
      description="Manage trader and admin accounts, statuses, and access levels."
      action={
        <PageActionGroup>
          <GhostButton type="button" onClick={() => setSearchOpen(true)}>
            <Search className="mr-2 inline-block h-4 w-4" />
            Search
          </GhostButton>

          {/* Import users dialog */}
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
                <Dialog.Title className="text-xl font-semibold text-foreground">
                  Import users
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                  Bulk user import via CSV — available in Phase 3.
                </Dialog.Description>
                <form className="mt-6 grid gap-4" onSubmit={handleImportUsers}>
                  <div className="rounded-2xl border border-dashed border-line bg-background p-6 text-center text-sm text-muted">
                    Drop CSV here or click browse
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <p className="text-sm text-muted">Full CSV import wired in Phase 3.</p>
                    <div className="flex gap-3">
                      <Dialog.Close asChild>
                        <GhostButton type="button">Cancel</GhostButton>
                      </Dialog.Close>
                      <PrimaryButton type="submit" disabled={isImporting}>
                        {isImporting ? "Processing…" : "Queue import"}
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

          {/* Add user dialog */}
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
                <Dialog.Title className="text-xl font-semibold text-foreground">
                  Add user
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                  Create a trader or admin account. Full invite flow wired in Phase 3.
                </Dialog.Description>
                <form className="mt-6 grid gap-4" onSubmit={handleAddUser}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField label="Full name" name="fullName" placeholder="Full name" />
                    <TextField label="Email" name="email" type="email" placeholder="user@example.com" />
                    <SelectField label="Role" name="role" defaultValue="TRADER">
                      <option value="TRADER">Trader</option>
                      <option value="ADMIN">Admin</option>
                    </SelectField>
                    <SelectField label="Initial status" name="status" defaultValue="ACTIVE">
                      <option value="ACTIVE">Active</option>
                      <option value="PENDING">Pending</option>
                    </SelectField>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <p className="text-sm text-muted">
                      User invite via Supabase auth available in Phase 3.
                    </p>
                    <div className="flex gap-3">
                      <Dialog.Close asChild>
                        <GhostButton type="button">Cancel</GhostButton>
                      </Dialog.Close>
                      <PrimaryButton type="submit" disabled={isSaving}>
                        {isSaving ? "Creating…" : "Create user"}
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
          { label: "Total users", value: isLoading ? "…" : users.length },
          { label: "Admins", value: users.filter((u) => u.role === "ADMIN").length, tone: "accent" },
          { label: "Traders", value: users.filter((u) => u.role === "TRADER").length, tone: "lime" },
          { label: "Pending", value: pendingCount, tone: pendingCount > 0 ? "accent" : undefined },
          { label: "Suspended", value: suspendedCount, tone: suspendedCount > 0 ? "danger" : undefined },
        ]}
      />

      {/* Filter chips */}
      <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
        <FilterChipRow
          chips={[
            {
              label: `All (${users.length})`,
              active: profileFilter === "ALL",
              onClick: () => setProfileFilter("ALL"),
            },
            {
              label: `Traders (${users.filter((u) => u.role === "TRADER").length})`,
              active: profileFilter === "TRADER",
              onClick: () => setProfileFilter("TRADER"),
            },
            {
              label: `Admins (${users.filter((u) => u.role === "ADMIN").length})`,
              active: profileFilter === "ADMIN",
              onClick: () => setProfileFilter("ADMIN"),
            },
            {
              label: `Pending (${pendingCount})`,
              active: profileFilter === "PENDING",
              onClick: () => setProfileFilter("PENDING"),
            },
            {
              label: `Suspended (${suspendedCount})`,
              active: profileFilter === "SUSPENDED",
              onClick: () => setProfileFilter("SUSPENDED"),
            },
          ]}
        />
      </div>

      {/* Notice banner */}
      {notice ? (
        <div
          className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-medium ${
            notice.type === "success"
              ? "border-accent/20 bg-accent/10 text-accent"
              : "border-danger/20 bg-danger/10 text-danger"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="mt-5 space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-line bg-panel animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-5 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          Failed to load users. Please refresh the page.
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="No users found"
            description={profileFilter !== "ALL" ? "No users match the current filter." : "No users in the system yet."}
          />
        </div>
      ) : selectedUser ? (
        <div className="mt-5">
          <Panel className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                  Selected profile
                </p>
                <h2 className="mt-2 text-lg font-semibold text-foreground">
                  {selectedUser.name}
                </h2>
                <p className="mt-1 text-sm text-muted">{selectedUser.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone={STATUS_TONE[selectedUser.status] ?? "muted"}>
                  {selectedUser.status}
                </StatusPill>
                <StatusPill tone={selectedUser.role === "ADMIN" ? "accent" : "lime"}>
                  {selectedUser.role}
                </StatusPill>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Status
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedUser.status}
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Segment
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedUser.segment}
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Joined
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {new Date(selectedUser.lastActiveAt).toLocaleDateString()}
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Role
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedUser.role}
                </p>
              </div>
            </div>

            {/* ── Real status action buttons ─────────────────────────────── */}
            <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4">
              {selectedUser.status !== "ACTIVE" && (
                <PrimaryButton
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() => handleStatusChange(selectedUser.id, "ACTIVE")}
                >
                  {statusMutation.isPending ? "Updating…" : "Activate"}
                </PrimaryButton>
              )}
              {selectedUser.status !== "PENDING" && (
                <GhostButton
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() => handleStatusChange(selectedUser.id, "PENDING")}
                >
                  Set pending
                </GhostButton>
              )}
              {selectedUser.status !== "SUSPENDED" && (
                <GhostButton
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() => handleStatusChange(selectedUser.id, "SUSPENDED")}
                >
                  Suspend
                </GhostButton>
              )}
              <p className="self-center text-xs text-muted">
                All status changes are logged to the audit trail.
              </p>
            </div>
          </Panel>
        </div>
      ) : null}

      {/* Directory search overlay */}
      <DirectorySearchOverlay<UserRecord>
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Find users"
        description="Search by name, email, or segment."
        items={users}
        selectedId={effectiveSelectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setSearchOpen(false);
        }}
        searchLabel="Search users"
        searchPlaceholder="Name, email, or segment"
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
              { value: "PENDING", label: "Pending" },
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
          const matchesRole =
            state.filters.role === "ALL" || user.role === state.filters.role;
          const matchesStatus =
            state.filters.status === "ALL" || user.status === state.filters.status;
          return matchesQuery && matchesRole && matchesStatus;
        }}
        renderRow={(user) => (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                <p className="mt-1 truncate text-xs text-muted">{user.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <StatusPill tone={STATUS_TONE[user.status] ?? "muted"}>{user.status}</StatusPill>
                <StatusPill tone={user.role === "ADMIN" ? "accent" : "lime"}>{user.role}</StatusPill>
              </div>
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                  Profile preview
                </p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{user.name}</h3>
                <p className="mt-1 text-sm text-muted">{user.email}</p>
              </div>
              <div className="flex items-center gap-1">
                <StatusPill tone={STATUS_TONE[user.status] ?? "muted"}>{user.status}</StatusPill>
                <StatusPill tone={user.role === "ADMIN" ? "accent" : "lime"}>{user.role}</StatusPill>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Segment</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{user.segment}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Joined</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {new Date(user.lastActiveAt).toLocaleString()}
                </p>
              </div>
            </div>
          </Panel>
        )}
      />
    </WorkspacePage>
  );
}
