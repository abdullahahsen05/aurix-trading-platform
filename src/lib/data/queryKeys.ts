export const queryKeys = {
  accounts: ["trading-accounts"] as const,
  trades: (accountId?: string) => ["trades", accountId ?? "all"] as const,
  analyticsSummary: (accountId: string) => ["analytics", "summary", accountId] as const,
  equityCurve: (accountId: string) => ["analytics", "equity-curve", accountId] as const,
  riskEvents: (accountId?: string) => ["risk", "events", accountId ?? "all"] as const,
  crmTraders: ["crm", "traders"] as const,
};
