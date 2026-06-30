"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import {
  DataTable,
  EmptyState,
  GhostButton,
  InlineStatusStrip,
  Panel,
  PageActionGroup,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { formatMoney } from "@/lib/utils/format";
import type { PartnerCommissionDto, PartnerCommissionSummaryDto } from "@/lib/partner/types";

const STATUS_TONE: Record<PartnerCommissionDto["status"], "lime" | "accent" | "danger" | "muted"> = {
  PENDING: "accent",
  APPROVED: "lime",
  PAID: "lime",
  CANCELLED: "muted",
};

interface CommissionsResponse {
  summary: PartnerCommissionSummaryDto;
  records: PartnerCommissionDto[];
}

export default function PartnerCommissionsPage() {
  const { data, isLoading, isError } = useQuery<CommissionsResponse>({
    queryKey: ["partner", "commissions"],
    queryFn: async () => {
      const res = await fetch("/api/partner/commissions");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load commissions");
      return json.data;
    },
  });

  const summary = data?.summary;
  const records = data?.records ?? [];

  return (
    <WorkspacePage
      eyebrow="Partner"
      title="Commissions"
      description="Your attributed commission ledger. Reporting only — payouts are handled separately."
      action={
        <PageActionGroup>
          <a href="/api/partner/commissions/export" download>
            <GhostButton type="button" disabled={records.length === 0}>
              <Download className="mr-2 inline-block h-4 w-4" />
              Export CSV
            </GhostButton>
          </a>
        </PageActionGroup>
      }
    >
      <InlineStatusStrip
        items={[
          { label: "Pending", value: summary ? formatMoney(summary.pending) : "—", tone: "accent" },
          { label: "Approved", value: summary ? formatMoney(summary.approved) : "—", tone: "lime" },
          { label: "Paid", value: summary ? formatMoney(summary.paid) : "—", tone: "lime" },
          {
            label: "Commission rate",
            value: summary ? `${summary.commissionPercent}%` : "—",
          },
        ]}
      />

      <div className="mt-5">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl border border-line bg-panel animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            Failed to load commissions.
          </div>
        ) : records.length === 0 ? (
          <EmptyState
            title="No commission records yet"
            description="When commission records are created for your attributed traders, they will appear here with their status."
          />
        ) : (
          <Panel className="min-w-0">
            <DataTable
              headers={["Date", "Trader", "Source", "Gross", "Rate", "Commission", "Status"]}
              rows={records.map((r) => [
                <span key="d">{new Date(r.createdAt).toLocaleDateString()}</span>,
                <span key="t">{r.traderName ?? "—"}</span>,
                <span key="s">{r.sourceType}</span>,
                <span key="g">{formatMoney({ amount: r.grossAmount, currency: r.currency })}</span>,
                <span key="r">{r.commissionPercent}%</span>,
                <span key="c" className="font-semibold text-foreground">
                  {formatMoney({ amount: r.commissionAmount, currency: r.currency })}
                </span>,
                <StatusPill key="st" tone={STATUS_TONE[r.status]}>
                  {r.status}
                </StatusPill>,
              ])}
            />
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
