export const realtimeEvents = {
  accountSnapshotUpdated: "account.snapshot.updated",
  tradeOpened: "trade.opened",
  tradeClosed: "trade.closed",
  riskEventCreated: "risk.event.created",
  notificationCreated: "notification.created",
} as const;

export type RealtimeEventName = (typeof realtimeEvents)[keyof typeof realtimeEvents];
