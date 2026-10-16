/**
 * Profit (FR-27 to FR-31). Net profit = revenue - refunds - Amazon fees (referral + FBA) -
 * ad spend - product cost. Inputs must already be in one currency (metrics/currency.ts).
 * Product rows count ad spend Amazon reports per product (Sponsored Products and Display); the
 * account view also counts Sponsored Brands, which Amazon reports per campaign only.
 * The same definitions run in SQL in pipeline/profit.py; the parity test compares them.
 */
import type {
  AdsCampaignDaily,
  AdsProductDaily,
  MarketplaceCode,
  Product,
  ProfitDaily,
} from '../data/types'
import { inRange, type DateRange } from './dates'
import { ratio } from './metrics'

export interface ProfitLine {
  units: number
  revenue: number
  refunds: number
  referralFees: number
  fbaFees: number
  amazonFees: number
  adSpend: number
  productCost: number
  netProfit: number
  netMargin: number | null
  profitPerUnit: number | null
}

interface Sums {
  units: number
  revenue: number
  refunds: number
  referralFees: number
  fbaFees: number
  adSpend: number
  productCost: number
}

const zero = (): Sums => ({
  units: 0,
  revenue: 0,
  refunds: 0,
  referralFees: 0,
  fbaFees: 0,
  adSpend: 0,
  productCost: 0,
})

function line(s: Sums): ProfitLine {
  const amazonFees = s.referralFees + s.fbaFees
  const netProfit = s.revenue - s.refunds - amazonFees - s.adSpend - s.productCost
  return {
    ...s,
    amazonFees,
    netProfit,
    netMargin: ratio(netProfit, s.revenue),
    profitPerUnit: ratio(netProfit, s.units),
  }
}

function addProfit(
  by: Map<string, Sums>,
  key: (i: number) => string,
  p: ProfitDaily,
  r: DateRange,
) {
  for (let i = 0; i < p.date.length; i++) {
    if (!inRange(p.date[i], r)) continue
    const k = key(i)
    const s = by.get(k) ?? zero()
    s.units += p.units_shipped[i]
    s.revenue += p.principal[i]
    s.refunds += p.refunds[i]
    s.referralFees += p.referral_fees[i]
    s.fbaFees += p.fba_fees[i]
    s.productCost += p.product_cost[i]
    by.set(k, s)
  }
}

function addAds(
  by: Map<string, Sums>,
  key: (i: number) => string,
  ads: { date: readonly string[]; cost: readonly number[] },
  r: DateRange,
) {
  for (let i = 0; i < ads.date.length; i++) {
    if (!inRange(ads.date[i], r)) continue
    const s = by.get(key(i)) ?? zero()
    s.adSpend += ads.cost[i]
    by.set(key(i), s)
  }
}

export interface ProductProfitRow extends ProfitLine {
  asin: string
  title: string
  category: string
  /** negative net profit (FR-29) */
  losesMoney: boolean
}

export function productProfitRows(
  profit: ProfitDaily,
  adsProduct: AdsProductDaily,
  products: Product[],
  range: DateRange,
): ProductProfitRow[] {
  const by = new Map<string, Sums>()
  addProfit(by, (i) => profit.asin[i], profit, range)
  addAds(by, (i) => adsProduct.asin[i], adsProduct, range)
  const meta = new Map(products.map((p) => [p.asin, p]))
  return [...by.entries()].map(([asin, s]) => {
    const l = line(s)
    const p = meta.get(asin)
    return {
      asin,
      title: p?.title ?? asin,
      category: p?.category ?? '',
      ...l,
      losesMoney: l.netProfit < 0,
    }
  })
}

export interface MarketplaceProfitRow extends ProfitLine {
  marketplace: MarketplaceCode
}

export function marketplaceProfitRows(
  profit: ProfitDaily,
  adsProduct: AdsProductDaily,
  range: DateRange,
): MarketplaceProfitRow[] {
  const by = new Map<string, Sums>()
  addProfit(by, (i) => profit.marketplace[i], profit, range)
  addAds(by, (i) => adsProduct.marketplace[i], adsProduct, range)
  return [...by.entries()]
    .map(([m, s]) => ({ marketplace: m as MarketplaceCode, ...line(s) }))
    .sort((a, b) => b.revenue - a.revenue)
}

/** The totals row of a product table: the sum of its rows. */
export function profitTotals(rows: ProfitLine[]): ProfitLine {
  const s = zero()
  for (const r of rows) {
    s.units += r.units
    s.revenue += r.revenue
    s.refunds += r.refunds
    s.referralFees += r.referralFees
    s.fbaFees += r.fbaFees
    s.adSpend += r.adSpend
    s.productCost += r.productCost
  }
  return line(s)
}

/** The account's profit: as the product totals, with every ad dollar (all ad types). */
export function accountProfit(
  profit: ProfitDaily,
  adsCampaign: AdsCampaignDaily,
  range: DateRange,
): ProfitLine {
  const by = new Map<string, Sums>()
  addProfit(by, () => 'all', profit, range)
  addAds(by, () => 'all', adsCampaign, range)
  return line(by.get('all') ?? zero())
}

export interface WaterfallStep {
  label: string
  kind: 'total' | 'cost'
  /** the bar runs from `from` to `to`; costs step down from the previous bar's end */
  from: number
  to: number
}

/** Revenue, then one step down per cost, then net profit (the Profit page chart). */
export function profitWaterfall(t: ProfitLine): WaterfallStep[] {
  const steps: WaterfallStep[] = [{ label: 'Revenue', kind: 'total', from: 0, to: t.revenue }]
  let level = t.revenue
  for (const [label, cost] of [
    ['Refunds', t.refunds],
    ['Referral fees', t.referralFees],
    ['FBA fees', t.fbaFees],
    ['Ad spend', t.adSpend],
    ['Product cost', t.productCost],
  ] as const) {
    steps.push({ label, kind: 'cost', from: level, to: level - cost })
    level -= cost
  }
  steps.push({ label: 'Net profit', kind: 'total', from: 0, to: level })
  return steps
}
