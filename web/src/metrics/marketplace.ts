/**
 * Marketplace filter and comparison (FR-17, FR-21). Fact files carry a marketplace column
 * (inventory: the fulfilment network); filtering keeps the rows of the chosen marketplaces in
 * every column, so the other metrics work unchanged on the result.
 */
import type {
  ISODate,
  InventoryDaily,
  Marketplace,
  MarketplaceCode,
  NetworkCode,
  SalesDaily,
} from '../data/types'
import { inRange, type DateRange } from './dates'
import { ratio } from './metrics'

export const MARKETPLACE_CODES: readonly MarketplaceCode[] = ['US', 'CA', 'MX', 'UK', 'DE', 'FR']

export type MarketplaceChoice = 'all' | MarketplaceCode

export function selectedCodes(choice: MarketplaceChoice): Set<MarketplaceCode> {
  return new Set(choice === 'all' ? MARKETPLACE_CODES : [choice])
}

/** A column-oriented file: every field is an array of the same length. */
type Columns<T> = { [K in keyof T]: readonly unknown[] }

/** The same file with only the rows where `keep(i)` is true, in every column. */
export function filterRows<T extends Columns<T>>(file: T, keep: (i: number) => boolean): T {
  const first = (Object.values(file)[0] ?? []) as readonly unknown[]
  const idx: number[] = []
  for (let i = 0; i < first.length; i++) if (keep(i)) idx.push(i)
  if (idx.length === first.length) return file
  return Object.fromEntries(
    Object.entries(file).map(([k, col]) => [k, idx.map((i) => (col as readonly unknown[])[i])]),
  ) as unknown as T
}

export function forMarketplaces<T extends Columns<T> & { marketplace: readonly MarketplaceCode[] }>(
  file: T,
  codes: Set<MarketplaceCode>,
): T {
  return filterRows(file, (i) => codes.has(file.marketplace[i]))
}

/** Inventory for the chosen marketplaces' fulfilment networks (DE and FR share EU). */
export function forNetworks(
  inventory: InventoryDaily,
  codes: Set<MarketplaceCode>,
  marketplaces: Marketplace[],
): InventoryDaily {
  const networks = new Set<NetworkCode>(
    marketplaces.filter((m) => codes.has(m.marketplace)).map((m) => m.network),
  )
  return filterRows(inventory, (i) => networks.has(inventory.network[i]))
}

export interface MarketplaceShare {
  marketplace: MarketplaceCode
  revenue: number
  orders: number
  units: number
  aov: number | null
  share: number | null
}

/**
 * Revenue, orders and units per marketplace with each one's share of revenue, largest first.
 * The sales must be in one currency (USD) so the shares add up to 100%.
 */
export function marketplaceShares(salesUsd: SalesDaily, range: DateRange): MarketplaceShare[] {
  const by = new Map<MarketplaceCode, { revenue: number; orders: number; units: number }>()
  for (let i = 0; i < salesUsd.date.length; i++) {
    if (!inRange(salesUsd.date[i] as ISODate, range)) continue
    const m = salesUsd.marketplace[i]
    const t = by.get(m) ?? { revenue: 0, orders: 0, units: 0 }
    t.revenue += salesUsd.sales[i]
    t.orders += salesUsd.orders[i]
    t.units += salesUsd.units[i]
    by.set(m, t)
  }
  const total = [...by.values()].reduce((a, t) => a + t.revenue, 0)
  return [...by.entries()]
    .map(([marketplace, t]) => ({
      marketplace,
      ...t,
      aov: ratio(t.revenue, t.orders),
      share: total === 0 ? null : t.revenue / total,
    }))
    .sort(
      (a, b) =>
        b.revenue - a.revenue ||
        MARKETPLACE_CODES.indexOf(a.marketplace) - MARKETPLACE_CODES.indexOf(b.marketplace),
    )
}
