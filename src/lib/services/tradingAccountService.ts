import { tradingAccounts } from "@/lib/data/mockData";

export async function listTradingAccounts() {
  return tradingAccounts;
}

export async function getTradingAccount(accountId: string) {
  return tradingAccounts.find((account) => account.accountId === accountId) ?? null;
}
