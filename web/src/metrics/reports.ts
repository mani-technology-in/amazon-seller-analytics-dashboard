/**
 * The four ready-made reports (FR-32): rows and CSV columns for the current filters. Money is
 * in the display currency; every money column header names it.
 */
import type { MarketplaceCode, SalesDaily } from '../data/types'
import type { CsvColumn } from '../lib/csv'
import { inRange, type DateRange } from './dates'
import type { CampaignRow, InventoryRow } from './metrics'
import type { ProductProfitRow } from './profit'

export interface SalesDayRow {
  date: string
  marketplace: MarketplaceCode
  revenue: number
  orders: number
  units: number
  sessions: number
}

/** Sales by marketplace by day: one row per day per marketplace with sales. */
export function salesByMarketplaceDay(s: SalesDaily, range: DateRange): SalesDayRow[] {
  const by = new Map<string, SalesDayRow>()
  for (let i = 0; i < s.date.length; i++) {
    if (!inRange(s.date[i], range)) continue
    const key = `${s.date[i]} ${s.marketplace[i]}`
    let r = by.get(key)
    if (!r) {
      r = {
        date: s.date[i],
        marketplace: s.marketplace[i],
        revenue: 0,
        orders: 0,
        units: 0,
        sessions: 0,
      }
      by.set(key, r)
    }
    r.revenue += s.sales[i]
    r.orders += s.orders[i]
    r.units += s.units[i]
    r.sessions += s.sessions[i]
  }
  return [...by.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.marketplace.localeCompare(b.marketplace),
  )
}

const money2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100)
const ratio4 = (v: number | null) => (v === null ? null : Math.round(v * 10000) / 10000)

export const salesDayColumns = (cur: string): CsvColumn<SalesDayRow>[] => [
  { header: 'Date', value: (r) => r.date },
  { header: 'Marketplace', value: (r) => r.marketplace },
  { header: `Revenue (${cur})`, value: (r) => money2(r.revenue) },
  { header: 'Orders', value: (r) => r.orders },
  { header: 'Units', value: (r) => r.units },
  { header: 'Sessions', value: (r) => r.sessions },
]

export const productProfitColumns = (cur: string): CsvColumn<ProductProfitRow>[] => [
  { header: 'ASIN', value: (r) => r.asin },
  { header: 'Product', value: (r) => r.title },
  { header: 'Units', value: (r) => r.units },
  { header: `Revenue (${cur})`, value: (r) => money2(r.revenue) },
  { header: `Refunds (${cur})`, value: (r) => money2(r.refunds) },
  { header: `Referral fees (${cur})`, value: (r) => money2(r.referralFees) },
  { header: `FBA fees (${cur})`, value: (r) => money2(r.fbaFees) },
  { header: `Ad spend, SP and SD (${cur})`, value: (r) => money2(r.adSpend) },
  { header: `Product cost, entered by the seller (${cur})`, value: (r) => money2(r.productCost) },
  { header: `Net profit (${cur})`, value: (r) => money2(r.netProfit) },
  { header: 'Net margin', value: (r) => ratio4(r.netMargin) },
  { header: `Profit per unit (${cur})`, value: (r) => money2(r.profitPerUnit) },
]

export const inventoryColumns: CsvColumn<InventoryRow>[] = [
  { header: 'Date', value: (r) => r.date },
  { header: 'Network', value: (r) => r.network },
  { header: 'ASIN', value: (r) => r.asin },
  { header: 'Product', value: (r) => r.title },
  { header: 'Available', value: (r) => r.available },
  { header: 'Inbound', value: (r) => r.inbound },
  { header: 'Avg daily units', value: (r) => Math.round(r.avgDailyUnits * 10) / 10 },
  {
    header: 'Days of cover',
    value: (r) => (r.daysOfCover === null ? null : Math.round(r.daysOfCover)),
  },
  {
    header: 'Status',
    value: (r) => (r.outOfStock ? 'Out of stock' : r.lowStock ? 'Low stock' : 'In stock'),
  },
]

export const campaignColumns = (cur: string): CsvColumn<CampaignRow>[] => [
  { header: 'Campaign ID', value: (r) => r.campaign_id },
  { header: 'Campaign', value: (r) => r.campaign_name },
  { header: 'Marketplace', value: (r) => r.marketplace },
  { header: 'Ad type', value: (r) => r.ad_product },
  { header: `Spend (${cur})`, value: (r) => money2(r.cost) },
  { header: `Ad sales (${cur})`, value: (r) => money2(r.sales) },
  { header: 'ACoS', value: (r) => ratio4(r.acos) },
  { header: 'ROAS', value: (r) => ratio4(r.roas) },
  { header: 'Impressions', value: (r) => r.impressions },
  { header: 'Clicks', value: (r) => r.clicks },
  { header: 'Orders', value: (r) => r.orders },
]
