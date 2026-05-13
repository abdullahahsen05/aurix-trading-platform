import { trades } from "@/lib/data/mockData";
import type { TradeStatus } from "@/lib/domain/types";

export async function listTrades(filters?: { accountId?: string; status?: TradeStatus }) {
  return trades.filter((trade) => {
    if (filters?.accountId && trade.accountId !== filters.accountId) return false;
    if (filters?.status && trade.status !== filters.status) return false;
    return true;
  });
}
