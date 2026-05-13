"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DirectorySearchOverlay } from "@/components/app/DirectorySearchOverlay";
import {
  GhostButton,
  FilterChipRow,
  InlineStatusStrip,
  Panel,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";

type AuditRecord = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  result: "Success" | "Failure";
  createdAt: string;
};

export default function AdminAuditPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("audit-001");
  const [resultFilter, setResultFilter] = useState<"ALL" | "Success" | "Failure">("ALL");

  const logs = useMemo<AuditRecord[]>(
    () => [
      {
        id: "audit-001",
        actor: "Platform Admin",
        action: "account.verify",
        entity: "TradingAccount",
        entityId: "seed-account-orion",
        result: "Success",
        createdAt: "2026-05-11T16:10:00.000Z",
      },
      {
        id: "audit-002",
        actor: "Risk Desk",
        action: "risk.note.create",
        entity: "RiskEvent",
        entityId: "risk-001",
        result: "Success",
        createdAt: "2026-05-11T15:45:00.000Z",
      },
      {
        id: "audit-003",
        actor: "Platform Admin",
        action: "crm.note.create",
        entity: "CrmNote",
        entityId: "note-002",
        result: "Success",
        createdAt: "2026-05-11T15:15:00.000Z",
      },
    ],
    [],
  );

  const filteredLogs = logs.filter((log) => resultFilter === "ALL" || log.result === resultFilter);
  const selectedLog = filteredLogs.find((log) => log.id === selectedId) ?? filteredLogs[0] ?? logs[0];

  return (
    <WorkspacePage
      eyebrow="Admin"
      title="Audit log"
      description="A quiet audit shell with search and paging moved into an overlay for high-volume review."
      action={
        <GhostButton type="button" onClick={() => setSearchOpen(true)}>
          <Search className="mr-2 inline-block h-4 w-4" />
          Search audit
        </GhostButton>
      }
    >
      <InlineStatusStrip
        items={[
          { label: "Events today", value: logs.length },
          { label: "Failures", value: logs.filter((log) => log.result === "Failure").length, tone: "lime" },
          { label: "Retention", value: "365 days", helper: "Production policy target" },
        ]}
      />

      <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
        <FilterChipRow
          chips={[
            {
              label: `All events (${logs.length})`,
              active: resultFilter === "ALL",
              onClick: () => {
                setResultFilter("ALL");
                setSelectedId(logs[0]?.id ?? "");
              },
            },
            {
              label: `Success (${logs.filter((log) => log.result === "Success").length})`,
              active: resultFilter === "Success",
              onClick: () => {
                setResultFilter("Success");
                setSelectedId(logs.find((log) => log.result === "Success")?.id ?? logs[0]?.id ?? "");
              },
            },
            {
              label: `Failure (${logs.filter((log) => log.result === "Failure").length})`,
              active: resultFilter === "Failure",
              onClick: () => {
                setResultFilter("Failure");
                setSelectedId(logs.find((log) => log.result === "Failure")?.id ?? logs[0]?.id ?? "");
              },
            },
          ]}
        />
      </div>

      <div className="mt-5">
        <Panel className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Selected event</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">{selectedLog.action}</h2>
          <p className="mt-1 text-sm text-muted">
            {selectedLog.actor} - {selectedLog.entity}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-line bg-background px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Actor</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedLog.actor}</p>
            </div>
            <div className="rounded-2xl border border-line bg-background px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Entity</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedLog.entity}</p>
            </div>
            <div className="rounded-2xl border border-line bg-background px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Entity ID</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedLog.entityId}</p>
            </div>
            <div className="rounded-2xl border border-line bg-background px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Result</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedLog.result}</p>
            </div>
          </div>
        </Panel>
      </div>

      <DirectorySearchOverlay<AuditRecord>
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search audit"
        description="Audit search and paging stay inside the overlay to keep the page sparse."
        items={logs}
        selectedId={selectedLog.id}
        onSelect={(id) => {
          setSelectedId(id);
          setSearchOpen(false);
        }}
        searchLabel="Search audit entries"
        searchPlaceholder="Search actor, action, entity, or result"
        emptyTitle="No audit entries match"
        emptyDescription="Use a different search term to reveal the matching actions."
        getId={(log) => log.id}
        matches={(log, state) => {
          const search = state.query.trim().toLowerCase();
          return (
            search.length === 0 ||
            log.actor.toLowerCase().includes(search) ||
            log.action.toLowerCase().includes(search) ||
            log.entity.toLowerCase().includes(search) ||
            log.entityId.toLowerCase().includes(search) ||
            log.result.toLowerCase().includes(search)
          );
        }}
        renderRow={(log) => (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{log.actor}</p>
                <p className="mt-1 truncate text-xs text-muted">{log.action}</p>
              </div>
              <StatusPill tone={log.result === "Success" ? "lime" : "danger"}>{log.result}</StatusPill>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-muted">
                {log.entity}
              </span>
              <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-muted">
                {new Date(log.createdAt).toLocaleDateString()}
              </span>
            </div>
          </>
        )}
        renderPreview={(log) => (
          <Panel className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Audit preview</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{log.action}</h3>
                <p className="mt-1 text-sm text-muted">
                  {log.actor} - {log.entity}
                </p>
              </div>
              <StatusPill tone={log.result === "Success" ? "lime" : "danger"}>{log.result}</StatusPill>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Actor</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{log.actor}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Entity</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{log.entity}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Entity ID</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{log.entityId}</p>
              </div>
              <div className="rounded-2xl border border-line bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Timestamp</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{new Date(log.createdAt).toLocaleString()}</p>
              </div>
            </div>
          </Panel>
        )}
      />
    </WorkspacePage>
  );
}
