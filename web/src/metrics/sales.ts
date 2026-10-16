/**
 * Overview and Sales page metrics (FR-5 to FR-7, FR-20 to FR-22, FR-11). They take files already
 * cut to the chosen marketplaces and converted to the display currency (data/selection.ts).
 */
import type {
  ISODate,
  InventoryDaily,
  MarketplaceCode,
  OverviewDaily,
  SalesDaily,
} from '../data/types'
import { addDays, inRange, rangeLength, type DateRange } from './dates'
import { MARKETPLACE_CODES } from './marketplace'
import { AVG_UNITS_WINDOW_DAYS, ratio } from './metrics'

export interface SalesTotals {
  revenue: number
  orders: number
  units: number
  adSpend: number
  adSales: number
}

/** Account totals from the pre-totalled overview file. */
export function overviewTotals(o: OverviewDaily, range: DateRange): SalesTotals {
  const t = { revenue: 0, orders: 0, units: 0, adSpend: 0, adSales: 0 }
  for (let i = 0; i < o.date.length; i++) {
    if (!inRange(o.date[i], range)) continue
    t.revenue += o.sales[i]
    t.orders += o.orders[i]
    t.units += o.units[i]
    t.adSpend += o.ad_spend[i]
    t.adSales += o.ad_sales[i]
  }
  return t
}

/** Every day of the range, in order. */
export function daysOf(range: DateRange): ISODate[] {
  const out: ISODate[] = []
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d)
  return out
}

export interface Bucket {
  /** first day of the bucket */
  start: ISODate
  end: ISODate
}

/**
 * Days, or 7-day weeks counted back from the range's last day when the range is longer than
 * `maxDaily` days (FR-6). The first week can be shorter.
 */
export function buckets(range: DateRange, maxDaily = 60): Bucket[] {
  if (rangeLength(range) <= maxDaily) return daysOf(range).map((d) => ({ start: d, end: d }))
  return weeks(range)
}

/** 7-day weeks ending on the range's last day; the first one can be shorter. */
export function weeks(range: DateRange): Bucket[] {
  const out: Bucket[] = []
  for (let end = range.end; end >= range.start; end = addDays(end, -7)) {
    const start = addDays(end, -6)
    out.unshift({ start: start < range.start ? range.start : start, end })
  }
  return out
}

function bucketIndex(bs: Bucket[]): (d: ISODate) => number {
  const index = new Map<ISODate, number>()
  bs.forEach((b, i) => {
    for (let d = b.start; d <= b.end; d = addDays(d, 1)) index.set(d, i)
  })
  return (d) => index.get(d) ?? -1
}

export interface RevenueSpendPoint extends Bucket {
  revenue: number
  adSpend: number
}

/** "Revenue against ad spend" (FR-6): daily up to 60 days, weekly when longer. */
export function revenueAndSpend(o: OverviewDaily, range: DateRange): RevenueSpendPoint[] {
  const bs = buckets(range)
  const at = bucketIndex(bs)
  const out = bs.map((b) => ({ ...b, revenue: 0, adSpend: 0 }))
  for (let i = 0; i < o.date.length; i++) {
    const k = at(o.date[i])
    if (k < 0) continue
    out[k].revenue += o.sales[i]
    out[k].adSpend += o.ad_spend[i]
  }
  return out
}

export interface MarketplaceSeries {
  marketplace: MarketplaceCode
  total: number
  buckets: Bucket[]
  values: number[]
}

/**
 * One series per marketplace that has rows in the file, in the standard order. `value` picks
 * the column; buckets are the range's days, or its weeks with `weekly`.
 */
export function byMarketplace(
  o: OverviewDaily,
  range: DateRange,
  value: (i: number) => number,
  weekly: boolean,
): MarketplaceSeries[] {
  let bs = weekly ? weeks(range) : daysOf(range).map((d) => ({ start: d, end: d }))
  // A short first week would draw as a misleadingly low bar: show whole weeks only (the total
  // still covers every day of the range).
  if (weekly && bs.length > 1 && rangeLength(bs[0]) < 7) bs = bs.slice(1)
  const at = bucketIndex(bs)
  const series = new Map<MarketplaceCode, { values: number[]; total: number }>()
  for (let i = 0; i < o.date.length; i++) {
    const m = o.marketplace[i]
    let sm = series.get(m)
    if (!sm) series.set(m, (sm = { values: new Array<number>(bs.length).fill(0), total: 0 }))
    if (!inRange(o.date[i], range)) continue
    sm.total += value(i)
    const k = at(o.date[i])
    if (k >= 0) sm.values[k] += value(i)
  }
  return MARKETPLACE_CODES.filter((m) => series.has(m)).map((m) => ({
    marketplace: m,
    buckets: bs,
    ...series.get(m)!,
  }))
}

/** "Units by marketplace" (FR-20): units per marketplace per week. */
export const unitsByMarketplace = (o: OverviewDaily, range: DateRange) =>
  byMarketplace(o, range, (i) => o.units[i], true)

/** "Revenue by marketplace" (FR-22): revenue per marketplace per day. */
export const revenueByMarketplace = (o: OverviewDaily, range: DateRange) =>
  byMarketplace(o, range, (i) => o.sales[i], false)

export interface SalesKpis {
  revenue: number
  orders: number
  units: number
  sessions: number
  aov: number | null
  unitSessionPct: number | null
}

/** Sales page tiles (FR-21). */
export function salesKpis(s: SalesDaily, range: DateRange): SalesKpis {
  let revenue = 0
  let orders = 0
  let units = 0
  let sessions = 0
  for (let i = 0; i < s.date.length; i++) {
    if (!inRange(s.date[i], range)) continue
    revenue += s.sales[i]
    orders += s.orders[i]
    units += s.units[i]
    sessions += s.sessions[i]
  }
  return {
    revenue,
    orders,
    units,
    sessions,
    aov: ratio(revenue, orders),
    unitSessionPct: ratio(units, sessions),
  }
}

/** Revenue per product per marketplace, for the product table's split (FR-11). */
export function productMarketplaceRevenue(
  s: SalesDaily,
  range: DateRange,
): Map<string, { marketplace: MarketplaceCode; revenue: number }[]> {
  const sums = new Map<string, Map<MarketplaceCode, number>>()
  for (let i = 0; i < s.date.length; i++) {
    if (!inRange(s.date[i], range)) continue
    let m = sums.get(s.asin[i])
    if (!m) sums.set(s.asin[i], (m = new Map()))
    m.set(s.marketplace[i], (m.get(s.marketplace[i]) ?? 0) + s.sales[i])
  }
  return new Map(
    [...sums].map(([asin, m]) => [
      asin,
      MARKETPLACE_CODES.filter((c) => m.has(c))
        .map((c) => ({ marketplace: c, revenue: m.get(c)! }))
        .sort((a, b) => b.revenue - a.revenue),
    ]),
  )
}

export interface StockCover {
  available: number
  avgDailyUnits: number
  daysOfCover: number | null
}

/**
 * Days of cover on `asOf` across the chosen fulfilment networks (FR-5): stock available that
 * day ÷ average units sold per day in the 30 days to it, for all products and for each one.
 */
export function stockCover(
  inventory: InventoryDaily,
  sales: SalesDaily,
  asOf: ISODate,
): { total: StockCover; byAsin: Map<string, StockCover> } {
  const window = { start: addDays(asOf, -(AVG_UNITS_WINDOW_DAYS - 1)), end: asOf }
  const units = new Map<string, number>()
  for (let i = 0; i < sales.date.length; i++) {
    if (!inRange(sales.date[i], window)) continue
    units.set(sales.asin[i], (units.get(sales.asin[i]) ?? 0) + sales.units[i])
  }
  const available = new Map<string, number>()
  for (let i = 0; i < inventory.date.length; i++) {
    if (inventory.date[i] !== asOf) continue
    available.set(
      inventory.asin[i],
      (available.get(inventory.asin[i]) ?? 0) + inventory.available[i],
    )
  }
  const cover = (a: number, u: number): StockCover => {
    const avgDailyUnits = u / AVG_UNITS_WINDOW_DAYS
    return { available: a, avgDailyUnits, daysOfCover: ratio(a, avgDailyUnits) }
  }
  const byAsin = new Map<string, StockCover>()
  let totalA = 0
  let totalU = 0
  for (const asin of new Set([...available.keys(), ...units.keys()])) {
    const a = available.get(asin) ?? 0
    const u = units.get(asin) ?? 0
    totalA += a
    totalU += u
    byAsin.set(asin, cover(a, u))
  }
  return { total: cover(totalA, totalU), byAsin }
}
