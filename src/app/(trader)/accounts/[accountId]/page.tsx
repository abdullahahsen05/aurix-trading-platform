import { notFound } from "next/navigation";
import { DataTable, InlineStatusStrip, Panel, StatusPill, WorkspacePage } from "@/components/app/WorkspaceUI";
import { AccountConnectionActions } from "@/components/accounts/AccountConnectionActions";
import { equityCurve, trades, tradingAccounts } from "@/lib/data/mockData";
import { formatMoney, formatPercent } from "@/lib/utils/format";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const account = tradingAccounts.find((item) => item.accountId === accountId);
  if (!account) notFound();

  const accountTrades = trades.filter((trade) => trade.accountId === accountId);
  const latestSnapshots = equityCurve.slice(-7).reverse();

  return (
    <WorkspacePage
      eyebrow="Account detail"
      title={account.accountName}
      description="Connection status, latest account state, sync readiness, and recent activity for this trading account."
      action={<AccountConnectionActions accountName={account.accountName} status={account.status} compact />}
    >
      <InlineStatusStrip
        items={[
          { label: "Balance", value: formatMoney(account.balance), helper: account.brokerName },
          { label: "Equity", value: formatMoney(account.equity), helper: "Latest snapshot", tone: "lime" },
          {
            label: "Floating PnL",
            value: formatMoney(account.floatingPnl),
            helper: `${account.openTradeCount} open trades`,
            tone: account.floatingPnl.amount >= 0 ? "accent" : "danger",
          },
          { label: "Drawdown", value: formatPercent(account.drawdownPercent), helper: "Current max" },
        ]}
      />

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.62fr_0.38fr]">
        <Panel>
          <h2 className="text-lg font-semibold text-foreground">Recent trades</h2>
          <div className="mt-4">
            <DataTable
              headers={["Symbol", "Side", "Status", "Volume", "Profit", "Opened"]}
              rows={accountTrades.map((trade) => [
                <span key="symbol" className="font-semibold text-foreground">{trade.symbol}</span>,
                trade.side,
                <StatusPill key="status" tone={trade.status === "OPEN" ? "accent" : "muted"}>{trade.status}</StatusPill>,
                trade.volume,
                <span key="profit" className={trade.profit.amount >= 0 ? "font-semibold text-accent-2" : "font-semibold text-danger"}>{formatMoney(trade.profit)}</span>,
                new Date(trade.openedAt).toLocaleDateString(),
              ])}
            />
          </div>
        </Panel>
        <Panel>
          <h2 className="text-lg font-semibold text-foreground">Snapshot feed</h2>
          <div className="mt-4 space-y-3">
            {latestSnapshots.map((snapshot) => (
              <div key={snapshot.capturedAt} className="flex items-center justify-between rounded-xl border border-line bg-background p-3 text-sm">
                <span className="text-muted">{new Date(snapshot.capturedAt).toLocaleString()}</span>
                <span className="font-semibold text-accent-2">${snapshot.equity.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

    </WorkspacePage>
  );
}
