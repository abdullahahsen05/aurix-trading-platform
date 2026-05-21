import type { TradeDto } from '@/lib/domain/types'

interface TradeRow {
  id: string
  trading_account_id: string
  symbol: string
  side: string
  status: string
  volume: number | string
  open_price: number | string
  close_price: number | string | null
  profit: number | string
  currency: string
  opened_at: string
  closed_at: string | null
}

export function mapTradeToDto(row: TradeRow): TradeDto {
  return {
    id: row.id,
    accountId: row.trading_account_id,
    symbol: row.symbol,
    side: row.side as 'BUY' | 'SELL',
    status: row.status as 'OPEN' | 'CLOSED',
    volume: Number(row.volume),
    openPrice: Number(row.open_price),
    closePrice: row.close_price != null ? Number(row.close_price) : null,
    profit: { amount: Number(row.profit), currency: row.currency ?? 'USD' },
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  }
}
