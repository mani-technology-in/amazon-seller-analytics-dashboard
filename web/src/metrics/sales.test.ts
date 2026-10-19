import { describe, expect, it } from 'vitest'
import type { InventoryDaily, OverviewDaily, SalesDaily } from '../data/types'
import {
  buckets,
  overviewTotals,
  productMarketplaceRevenue,
  revenueAndSpend,
  revenueByMarketplace,
  salesKpis,
  stockCover,
  stockSeries,
  unitsByMarketplace,
  weeks,
} from './sales'

const overview: OverviewDaily = {
  date: ['2026-09-01', '2026-09-01', '2026-09-08', '2026-09-14', '2026-08-31'],
  marketplace: ['US', 'UK', 'US', 'UK', 'US'],
  sales: [100, 40, 60, 20, 999],
  orders: [4, 2, 3, 1, 9],
  units: [5, 2, 3, 1, 9],
  ad_spend: [10, 4, 6, 0, 99],
  ad_sales: [30, 8, 12, 0, 99],
}
const sept = { start: '2026-09-01', end: '2026-09-14' }

describe('overview (FR-5, FR-6, FR-20)', () => {
  it('totals the range only', () => {
    expect(overviewTotals(overview, sept)).toEqual({
      revenue: 220,
      orders: 10,
      units: 11,
      adSpend: 20,
      adSales: 50,
    })
  })

  it('weeks count back from the last day; the first can be short', () => {
    expect(weeks({ start: '2026-09-01', end: '2026-09-16' })).toEqual([
      { start: '2026-09-01', end: '2026-09-02' },
      { start: '2026-09-03', end: '2026-09-09' },
      { start: '2026-09-10', end: '2026-09-16' },
    ])
  })

  it('the revenue chart is daily up to 60 days and weekly beyond', () => {
    expect(buckets({ start: '2026-08-02', end: '2026-09-30' })).toHaveLength(60)
    expect(buckets({ start: '2026-08-01', end: '2026-09-30' })).toHaveLength(8) // 61 days: 8 whole weeks
    const daily = revenueAndSpend(overview, sept)
    expect(daily).toHaveLength(14)
    expect(daily[0]).toMatchObject({ start: '2026-09-01', revenue: 140, adSpend: 14 })
    expect(daily[13]).toMatchObject({ revenue: 20, adSpend: 0 })
    expect(daily.reduce((a, p) => a + p.revenue, 0)).toBe(220)
  })

  it('units by marketplace: whole weeks only, the total still covers every day', () => {
    const s = unitsByMarketplace(overview, { start: '2026-08-31', end: '2026-09-14' })
    expect(s[0].buckets).toEqual([
      { start: '2026-09-01', end: '2026-09-07' },
      { start: '2026-09-08', end: '2026-09-14' },
    ])
    expect(s[0].values).toEqual([5, 3])
    expect(s[0].total).toBe(17) // 31 Aug's 9 units are counted in the total
  })

  it('units by marketplace: one weekly series per marketplace, totals add up', () => {
    const s = unitsByMarketplace(overview, sept)
    expect(s.map((m) => [m.marketplace, m.values, m.total])).toEqual([
      ['US', [5, 3], 8],
      ['UK', [2, 1], 3],
    ])
  })

  it('revenue by marketplace is daily, in the standard marketplace order', () => {
    const s = revenueByMarketplace(overview, sept)
    expect(s.map((m) => m.marketplace)).toEqual(['US', 'UK'])
    expect(s[0].values).toHaveLength(14)
    expect(s[0].total).toBe(160) // August's 999 is outside the range
  })
})

const sales: SalesDaily = {
  date: ['2026-09-01', '2026-09-01', '2026-09-02', '2026-08-01'],
  marketplace: ['US', 'DE', 'US', 'US'],
  asin: ['A1', 'A1', 'A2', 'A1'],
  units: [6, 3, 1, 50],
  orders: [5, 3, 1, 40],
  sales: [120, 90, 30, 999],
  sessions: [40, 20, 20, 400],
}

describe('sales (FR-21, FR-11)', () => {
  it('tiles: revenue, orders, units, sessions, AOV and unit session percentage', () => {
    expect(salesKpis(sales, sept)).toEqual({
      revenue: 240,
      orders: 9,
      units: 10,
      sessions: 80,
      aov: 240 / 9,
      unitSessionPct: 10 / 80,
    })
    const none = salesKpis(sales, { start: '2027-01-01', end: '2027-01-31' })
    expect(none.aov).toBeNull()
    expect(none.unitSessionPct).toBeNull()
  })

  it('splits each product by marketplace, largest first', () => {
    const split = productMarketplaceRevenue(sales, sept)
    expect(split.get('A1')).toEqual([
      { marketplace: 'US', revenue: 120 },
      { marketplace: 'DE', revenue: 90 },
    ])
    expect(split.get('A2')).toEqual([{ marketplace: 'US', revenue: 30 }])
  })
})

describe('days of cover (FR-5)', () => {
  it('stock on the last day ÷ average daily units over 30 days, across networks', () => {
    const inv: InventoryDaily = {
      date: ['2026-09-30', '2026-09-30', '2026-09-30', '2026-09-29'],
      network: ['US', 'EU', 'US', 'US'],
      asin: ['A1', 'A1', 'A2', 'A1'],
      available: [60, 30, 0, 999],
      reserved: [0, 0, 0, 0],
      inbound: [0, 0, 0, 0],
    }
    const s: SalesDaily = {
      date: ['2026-09-30', '2026-09-01', '2026-08-31'],
      marketplace: ['US', 'DE', 'US'],
      asin: ['A1', 'A1', 'A1'],
      units: [20, 10, 500], // 31 Aug is outside the 30-day window
      orders: [1, 1, 1],
      sales: [1, 1, 1],
      sessions: [1, 1, 1],
    }
    const c = stockCover(inv, s, '2026-09-30')
    expect(c.byAsin.get('A1')).toEqual({ available: 90, avgDailyUnits: 1, daysOfCover: 90 })
    expect(c.byAsin.get('A2')).toEqual({ available: 0, avgDailyUnits: 0, daysOfCover: null })
    expect(c.total.daysOfCover).toBe(90)
  })
})

describe('stock over time (FR-24)', () => {
  it('one product in one network, with the stock-out runs', () => {
    const inv: InventoryDaily = {
      date: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-02'],
      network: ['EU', 'EU', 'EU', 'EU', 'US'],
      asin: ['A1', 'A1', 'A1', 'A1', 'A1'],
      available: [5, 0, 0, 40, 99],
      reserved: [0, 0, 0, 0, 0],
      inbound: [0, 0, 0, 0, 0],
    }
    const s = stockSeries(inv, 'A1', 'EU', { start: '2026-09-01', end: '2026-09-05' })
    expect(s.available).toEqual([5, 0, 0, 40, null])
    expect(s.outOfStock).toEqual([{ start: '2026-09-02', end: '2026-09-03' }])
  })
})
