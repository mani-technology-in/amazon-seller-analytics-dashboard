import { describe, expect, it } from 'vitest'
import type {
  AdsCampaignDaily,
  AdsProductDaily,
  AdsTargetDaily,
  Campaign,
  InventoryDaily,
  Product,
  SalesDaily,
  Target,
} from '../data/types'
import {
  accountKpis,
  campaignRows,
  dailySeries,
  inventoryRows,
  productRows,
  ratio,
  targetRows,
  topBy,
} from './metrics'

// A tiny hand-checked dataset: two products, two campaigns, three days.
const products: Product[] = [
  {
    asin: 'A1',
    sku: 'S1',
    title: 'One',
    category: 'Kitchen',
    price: 20,
    launch_date: '2024-01-01',
  },
  { asin: 'A2', sku: 'S2', title: 'Two', category: 'Bath', price: 10, launch_date: '2024-01-01' },
]
const sales: SalesDaily = {
  date: ['2026-01-01', '2026-01-01', '2026-01-02', '2026-01-03'],
  asin: ['A1', 'A2', 'A1', 'A1'],
  units: [3, 2, 1, 4],
  orders: [3, 1, 1, 4],
  sales: [60, 20, 20, 80],
  sessions: [30, 0, 10, 40],
  page_views: [40, 0, 12, 50],
}
const campaigns: Campaign[] = [
  {
    campaign_id: '11',
    campaign_name: 'SP one',
    ad_product: 'SP',
    ad_product_name: 'Sponsored Products',
    campaign_status: 'ENABLED',
    budget: 50,
  },
  {
    campaign_id: '22',
    campaign_name: 'SB one',
    ad_product: 'SB',
    ad_product_name: 'Sponsored Brands',
    campaign_status: 'ENABLED',
    budget: null,
  },
]
const adsCampaign: AdsCampaignDaily = {
  date: ['2026-01-01', '2026-01-01', '2026-01-02'],
  campaign_id: ['11', '22', '11'],
  impressions: [1000, 500, 1000],
  clicks: [10, 5, 10],
  cost: [10, 6, 10],
  orders: [1, 0, 1],
  sales: [40, 0, 20],
  units: [1, 0, 1],
}
const adsProduct: AdsProductDaily = {
  date: ['2026-01-01', '2026-01-02'],
  asin: ['A1', 'A1'],
  impressions: [1000, 1000],
  clicks: [10, 10],
  cost: [10, 10],
  orders: [1, 1],
  sales: [40, 20],
}
const targets: Target[] = [
  { campaign_id: '11', target_id: '1', ad_product: 'SP', target_text: 'k1', match_type: 'EXACT' },
  { campaign_id: '22', target_id: '2', ad_product: 'SB', target_text: 'k2', match_type: 'BROAD' },
]
const adsTarget: AdsTargetDaily = {
  date: ['2026-01-01', '2026-01-01', '2026-01-02'],
  campaign_id: ['11', '22', '11'],
  target_id: ['1', '2', '1'],
  impressions: [1000, 500, 1000],
  clicks: [10, 5, 10],
  cost: [10, 6, 10],
  orders: [1, 0, 1],
  sales: [40, 0, 20],
}
const ALL = { start: '2026-01-01', end: '2026-01-03' }

describe('ratio', () => {
  it('divides, or is null for a zero denominator', () => {
    expect(ratio(1, 4)).toBe(0.25)
    expect(ratio(5, 0)).toBeNull()
    expect(ratio(0, 0)).toBeNull()
  })
})

describe('account KPIs (FR-5)', () => {
  it('follow the metric definitions', () => {
    const k = accountKpis(sales, adsCampaign, ALL)
    expect(k).toMatchObject({ sales: 180, orders: 9, units: 10, adSpend: 26, adSales: 60 })
    expect(k.acos).toBeCloseTo(26 / 60)
    expect(k.tacos).toBeCloseTo(26 / 180)
    expect(k.roas).toBeCloseTo(60 / 26)
  })

  it('only count days in the range', () => {
    const k = accountKpis(sales, adsCampaign, { start: '2026-01-03', end: '2026-01-03' })
    expect(k.sales).toBe(80)
    expect(k.adSpend).toBe(0)
    expect(k.acos).toBeNull() // no ad sales: a dash, not 0
    expect(k.roas).toBeNull()
    expect(k.tacos).toBe(0)
  })
})

describe('daily series (FR-6, FR-12)', () => {
  it('has one point per day, including days with no sales', () => {
    const s = dailySeries(sales, adsCampaign, { start: '2026-01-01', end: '2026-01-04' })
    expect(s.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'])
    expect(s[0]).toMatchObject({ sales: 80, adSpend: 16, adSales: 40 })
    expect(s[3]).toMatchObject({ sales: 0, adSpend: 0, acos: null, tacos: null })
  })

  it('can follow one product', () => {
    const s = dailySeries(sales, adsProduct, ALL, 'A2')
    expect(s.map((p) => p.sales)).toEqual([20, 0, 0])
    expect(s.map((p) => p.adSpend)).toEqual([0, 0, 0])
  })
})

describe('campaigns (FR-8, FR-9)', () => {
  it('compute CTR, CPC, conversion, ACoS and ROAS per campaign', () => {
    const [sp, sb] = campaignRows(adsCampaign, campaigns, ALL)
    expect(sp).toMatchObject({ impressions: 2000, clicks: 20, cost: 20, orders: 2, sales: 60 })
    expect(sp.ctr).toBeCloseTo(0.01)
    expect(sp.cpc).toBeCloseTo(1)
    expect(sp.cvr).toBeCloseTo(0.1)
    expect(sp.acos).toBeCloseTo(1 / 3)
    expect(sp.roas).toBeCloseTo(3)
    expect(sb.acos).toBeNull()
    expect(sb.cvr).toBe(0)
  })

  it('keep campaigns with no activity in the range', () => {
    const rows = campaignRows(adsCampaign, campaigns, { start: '2026-01-03', end: '2026-01-03' })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ cost: 0, ctr: null, cpc: null })
  })

  it('filter by ad type and campaign', () => {
    expect(campaignRows(adsCampaign, campaigns, ALL, { adProducts: ['SB'] })).toHaveLength(1)
    expect(campaignRows(adsCampaign, campaigns, ALL, { campaignIds: ['11'] })[0].campaign_id).toBe(
      '11',
    )
  })
})

describe('keywords and targets (FR-10)', () => {
  it('flag spend with no sales and ACoS above target', () => {
    const [k1, k2] = targetRows(adsTarget, targets, campaigns, ALL, 0.3)
    expect(k1).toMatchObject({ cost: 20, sales: 60, noSales: false, campaign_name: 'SP one' })
    expect(k1.acosAboveTarget).toBe(true) // 33% > 30%
    expect(k2).toMatchObject({ cost: 6, sales: 0, noSales: true, acosAboveTarget: false })
  })

  it('use the target ACoS setting', () => {
    expect(targetRows(adsTarget, targets, campaigns, ALL, 0.4)[0].acosAboveTarget).toBe(false)
  })
})

describe('products (FR-11)', () => {
  it('compute unit session percentage and TACoS', () => {
    const [a1, a2] = productRows(sales, adsProduct, products, ALL)
    expect(a1).toMatchObject({ sales: 160, units: 8, sessions: 80, adSpend: 20, adSales: 60 })
    expect(a1.unitSessionPct).toBeCloseTo(0.1)
    expect(a1.tacos).toBeCloseTo(20 / 160)
    expect(a2.unitSessionPct).toBeNull() // no sessions
    expect(a2.tacos).toBe(0)
  })
})

describe('inventory (FR-13, FR-14)', () => {
  const inventory: InventoryDaily = {
    date: ['2026-01-03', '2026-01-03'],
    asin: ['A1', 'A2'],
    available: [6, 0],
    reserved: [1, 0],
    inbound: [100, 0],
  }

  it('averages units over the 30 days ending on the stock date', () => {
    const [a1] = inventoryRows(inventory, sales, products, '2026-01-03')
    expect(a1.avgDailyUnits).toBeCloseTo(8 / 30)
    expect(a1.daysOfCover).toBeCloseTo(6 / (8 / 30))
  })

  it('flags low stock and out of stock', () => {
    const [a1, a2] = inventoryRows(inventory, sales, products, '2026-01-03', 21)
    expect(a1).toMatchObject({ lowStock: false, outOfStock: false }) // 22.5 days of cover
    expect(a2).toMatchObject({ outOfStock: true, lowStock: false })
    expect(inventoryRows(inventory, sales, products, '2026-01-03', 30)[0].lowStock).toBe(true)
  })

  it('shows "no recent sales" (null cover) when nothing sold', () => {
    const quiet: InventoryDaily = { ...inventory, date: ['2026-03-01', '2026-03-01'] }
    expect(inventoryRows(quiet, sales, products, '2026-03-01')[0].daysOfCover).toBeNull()
  })
})

describe('top lists (FR-7)', () => {
  it('sort by a value and keep the first n', () => {
    expect(topBy([{ v: 1 }, { v: 5 }, { v: 3 }], (r) => r.v, 2)).toEqual([{ v: 5 }, { v: 3 }])
  })
})
