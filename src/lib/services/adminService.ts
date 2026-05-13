import { adminSummary, traders, tradingAccounts } from "@/lib/data/mockData";

export async function getAdminSummary() {
  return adminSummary;
}

export async function listAdminUsers() {
  return [
    ...traders.map((trader) => ({
      id: trader.traderId,
      email: trader.email,
      name: trader.name,
      role: "TRADER" as const,
      status: "ACTIVE",
    })),
    {
      id: "admin-001",
      email: "admin@example.com",
      name: "Platform Admin",
      role: "ADMIN" as const,
      status: "ACTIVE",
    },
  ];
}

export async function listSupervisedAccounts() {
  return tradingAccounts;
}
