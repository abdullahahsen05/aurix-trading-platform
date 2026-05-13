import type { MoneyValue } from "@/lib/domain/types";

export function formatMoney(value: MoneyValue): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: value.currency,
    maximumFractionDigits: 0,
  }).format(value.amount);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
