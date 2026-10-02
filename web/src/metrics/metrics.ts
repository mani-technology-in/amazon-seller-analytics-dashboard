/**
 * Every number on the dashboard comes from these functions, and each follows one definition in
 * docs/metric-definitions.md. Ratios with a zero denominator are `null` (shown as a dash).
 * The same metrics are computed in SQL by pipeline/parity.py, and the parity test checks that
 * both give identical results.
 */
import type {
  AdProduct,
  AdsCampaignDaily,
  AdsProductDaily,
  AdsTargetDaily,
  Campaign,
  ISODate,
  InventoryDaily,
  Product,
  SalesDaily,
  Target,
} from '../data/types'
import { addDays, inRange, type DateRange } from './dates'

export const DEFAULT_TARGET_ACOS = 0.3
export const DEFAULT_LOW_STOCK_DAYS = 21
export const AVG_UNITS_WINDOW_DAYS = 30

/** a / b, or null when b is 0. */
export function ratio(a: number, b: number): number | null {
  return b === 0 ? null : a / b
}

// --- Account KPIs (FR-5) ----------------------------------------------------------------

export interface AccountKpis {
  sales: number
  orders: number
  units: number
  adSpend: number
  adSales: number
  adOrders: number
  impressions: number
  clicks: number
  acos: number | null
  tacos: number | null
  roas: number | null
}

export function accountKpis(
  sales: SalesDaily,
  ads: AdsCampaignDaily,
  range: DateRange,
): AccountKpis {
  let s = 0
  let orders = 0
  let units = 0
  for (let i = 0; i < sales.date.length; i++) {
    if (!inRange(sales.date[i], range)) continue
    s += sales.sales[i]
    orders += sales.orders[i]
    units += sales.units[i]
  }
  let adSpend = 0
  let adSales = 0
  let adOrders = 0
  let impressions = 0
  let clicks = 0
  for (let i = 0; i < ads.date.length; i++) {
    if (!inRange(ads.date[i], range)) continue
    adSpend += ads.cost[i]
    adSales += ads.sales[i]
    adOrders += ads.orders[i]
    impressions += ads.impressions[i]
    clicks += ads.clicks[i]
  }
  return {
    sales: s,
    orders,
    units,
    adSpend,
    adSales,
    adOrders,
    impressions,
    clicks,
    acos: ratio(adSpend, adSales),
    tacos: ratio(adSpend, s),
    roas: ratio(adSales, adSpend),
  }
}

// --- Daily trend (FR-6, FR-12) -----------------------------------------------------------

export interface DailyPoint {
  date: ISODate
  sales: number
  units: number
  adSpend: number
  adSales: number
  acos: number | null
  tacos: number | null
}

function days(range: DateRange): ISODate[] {
  const out: ISODate[] = []
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d)
  return out
}

/** One point per day in the range: account totals, or one product when `asin` is given. */
export function dailySeries(
  sales: SalesDaily,
  ads: AdsCampaignDaily | AdsProductDaily,
  range: DateRange,
  asin?: string,
): DailyPoint[] {
  const points = new Map(
    days(range).map((date) => [date, { date, sales: 0, units: 0, adSpend: 0, adSales: 0 }]),
  )
  for (let i = 0; i < sales.date.length; i++) {
    const p = points.get(sales.date[i])
    if (!p || (asin && sales.asin[i] !== asin)) continue
    p.sales += sales.sales[i]
    p.units += sales.units[i]
  }
  const adAsins = 'asin' in ads ? ads.asin : null
  for (let i = 0; i < ads.date.length; i++) {
    const p = points.get(ads.date[i])
    if (!p || (asin && adAsins?.[i] !== asin)) continue
    p.adSpend += ads.cost[i]
    p.adSales += ads.sales[i]
  }
  return [...points.values()].map((p) => ({
    ...p,
    acos: ratio(p.adSpend, p.adSales),
    tacos: ratio(p.adSpend, p.sales),
  }))
}

// --- Campaigns (FR-7, FR-8, FR-9) --------------------------------------------------------

export interface AdTotals {
  impressions: number
  clicks: number
  cost: number
  orders: number
  sales: number
  ctr: number | null
  cpc: number | null
  cvr: number | null
  acos: number | null
  roas: number | null
}

function adTotals(t: {
  impressions: number
  clicks: number
  cost: number
  orders: number
  sales: number
}): AdTotals {
  return {
    ...t,
    ctr: ratio(t.clicks, t.impressions),
    cpc: ratio(t.cost, t.clicks),
    cvr: ratio(t.orders, t.clicks),
    acos: ratio(t.cost, t.sales),
    roas: ratio(t.sales, t.cost),
  }
}

const zero = () => ({ impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 })

export interface AdFilter {
  adProducts?: AdProduct[]
  campaignIds?: string[]
}

function passes(f: AdFilter | undefined, adProduct: AdProduct, campaignId: string): boolean {
  if (f?.adProducts?.length && !f.adProducts.includes(adProduct)) return false
  if (f?.campaignIds?.length && !f.campaignIds.includes(campaignId)) return false
  return true
}

export type CampaignRow = Campaign & AdTotals

/** Every campaign that passes the filter, including ones with no activity in the range. */
export function campaignRows(
  ads: AdsCampaignDaily,
  campaigns: Campaign[],
  range: DateRange,
  filter?: AdFilter,
): CampaignRow[] {
  const sums = new Map(campaigns.map((c) => [c.campaign_id, zero()]))
  for (let i = 0; i < ads.date.length; i++) {
    if (!inRange(ads.date[i], range)) continue
    const s = sums.get(ads.campaign_id[i])
    if (!s) continue
    s.impressions += ads.impressions[i]
    s.clicks += ads.clicks[i]
    s.cost += ads.cost[i]
    s.orders += ads.orders[i]
    s.sales += ads.sales[i]
  }
  return campaigns
    .filter((c) => passes(filter, c.ad_product, c.campaign_id))
    .map((c) => ({ ...c, ...adTotals(sums.get(c.campaign_id)!) }))
}

// --- Keywords and targets (FR-10) --------------------------------------------------------

export interface TargetRow extends Target, AdTotals {
  campaign_name: string
  /** spent money in the range without a single attributed sale */
  noSales: boolean
  /** ACoS above the target ACoS setting */
  acosAboveTarget: boolean
}

export const targetKey = (campaignId: string, targetId: string) => `${campaignId}:${targetId}`

export function targetRows(
  ads: AdsTargetDaily,
  targets: Target[],
  campaigns: Campaign[],
  range: DateRange,
  targetAcos = DEFAULT_TARGET_ACOS,
  filter?: AdFilter,
): TargetRow[] {
  const names = new Map(campaigns.map((c) => [c.campaign_id, c.campaign_name]))
  const sums = new Map(targets.map((t) => [targetKey(t.campaign_id, t.target_id), zero()]))
  for (let i = 0; i < ads.date.length; i++) {
    if (!inRange(ads.date[i], range)) continue
    const s = sums.get(targetKey(ads.campaign_id[i], ads.target_id[i]))
    if (!s) continue
    s.impressions += ads.impressions[i]
    s.clicks += ads.clicks[i]
    s.cost += ads.cost[i]
    s.orders += ads.orders[i]
    s.sales += ads.sales[i]
  }
  return targets
    .filter((t) => passes(filter, t.ad_product, t.campaign_id))
    .map((t) => {
      const totals = adTotals(sums.get(targetKey(t.campaign_id, t.target_id))!)
      return {
        ...t,
        ...totals,
        campaign_name: names.get(t.campaign_id) ?? '',
        noSales: totals.cost > 0 && totals.sales === 0,
        acosAboveTarget: totals.acos !== null && totals.acos > targetAcos,
      }
    })
}

// --- Products (FR-11) --------------------------------------------------------------------

export interface ProductRow extends Product {
  sales: number
  units: number
  orders: number
  sessions: number
  /** units ordered / sessions */
  unitSessionPct: number | null
  /** Sponsored Products + Sponsored Display only (Amazon reports SB spend per campaign) */
  adSpend: number
  adSales: number
  tacos: number | null
}

export function productRows(
  sales: SalesDaily,
  ads: AdsProductDaily,
  products: Product[],
  range: DateRange,
): ProductRow[] {
  const sums = new Map(
    products.map((p) => [
      p.asin,
      { sales: 0, units: 0, orders: 0, sessions: 0, adSpend: 0, adSales: 0 },
    ]),
  )
  for (let i = 0; i < sales.date.length; i++) {
    if (!inRange(sales.date[i], range)) continue
    const s = sums.get(sales.asin[i])
    if (!s) continue
    s.sales += sales.sales[i]
    s.units += sales.units[i]
    s.orders += sales.orders[i]
    s.sessions += sales.sessions[i]
  }
  for (let i = 0; i < ads.date.length; i++) {
    if (!inRange(ads.date[i], range)) continue
    const s = sums.get(ads.asin[i])
    if (!s) continue
    s.adSpend += ads.cost[i]
    s.adSales += ads.sales[i]
  }
  return products.map((p) => {
    const s = sums.get(p.asin)!
    return {
      ...p,
      ...s,
      unitSessionPct: ratio(s.units, s.sessions),
      tacos: ratio(s.adSpend, s.sales),
    }
  })
}

// --- Inventory (FR-13, FR-14) ------------------------------------------------------------

export interface InventoryRow extends Product {
  date: ISODate
  available: number
  reserved: number
  inbound: number
  /** units sold in the 30 days ending on `date`, divided by 30 */
  avgDailyUnits: number
  daysOfCover: number | null
  outOfStock: boolean
  lowStock: boolean
}

/**
 * Stock position on `asOf` (the last day of data by default). The average always covers the
 * 30 days ending on `asOf`, whatever date range the rest of the page shows.
 */
export function inventoryRows(
  inventory: InventoryDaily,
  sales: SalesDaily,
  products: Product[],
  asOf: ISODate,
  lowStockDays = DEFAULT_LOW_STOCK_DAYS,
): InventoryRow[] {
  const window = { start: addDays(asOf, -(AVG_UNITS_WINDOW_DAYS - 1)), end: asOf }
  const units = new Map<string, number>()
  for (let i = 0; i < sales.date.length; i++) {
    if (!inRange(sales.date[i], window)) continue
    units.set(sales.asin[i], (units.get(sales.asin[i]) ?? 0) + sales.units[i])
  }
  const byAsin = new Map(products.map((p) => [p.asin, p]))
  const rows: InventoryRow[] = []
  for (let i = 0; i < inventory.date.length; i++) {
    if (inventory.date[i] !== asOf) continue
    const p = byAsin.get(inventory.asin[i])
    if (!p) continue
    const available = inventory.available[i]
    const avgDailyUnits = (units.get(p.asin) ?? 0) / AVG_UNITS_WINDOW_DAYS
    const daysOfCover = ratio(available, avgDailyUnits)
    const outOfStock = available <= 0
    rows.push({
      ...p,
      date: asOf,
      available,
      reserved: inventory.reserved[i],
      inbound: inventory.inbound[i],
      avgDailyUnits,
      daysOfCover,
      outOfStock,
      lowStock: !outOfStock && daysOfCover !== null && daysOfCover < lowStockDays,
    })
  }
  return rows
}

// --- Top lists (FR-7) --------------------------------------------------------------------

export function topBy<T>(rows: T[], value: (r: T) => number, n = 5): T[] {
  return [...rows].sort((a, b) => value(b) - value(a)).slice(0, n)
}
