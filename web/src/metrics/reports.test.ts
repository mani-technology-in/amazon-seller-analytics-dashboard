import { describe, expect, it } from 'vitest'
import type { SalesDaily } from '../data/types'
import { toCsv } from '../lib/csv'
import { salesByMarketplaceDay, salesDayColumns } from './reports'

describe('sales by marketplace by day (FR-32)', () => {
  const s: SalesDaily = {
    date: ['2026-09-02', '2026-09-01', '2026-09-01', '2026-09-01', '2026-08-31'],
    marketplace: ['US', 'UK', 'US', 'US', 'US'],
    asin: ['A1', 'A1', 'A1', 'A2', 'A1'],
    units: [1, 2, 3, 4, 5],
    orders: [1, 2, 3, 4, 5],
    sales: [10, 20.005, 30, 40, 50],
    sessions: [5, 6, 7, 8, 9],
  }

  it('one row per day per marketplace, products added together, in date order', () => {
    const rows = salesByMarketplaceDay(s, { start: '2026-09-01', end: '2026-09-30' })
    expect(rows.map((r) => [r.date, r.marketplace, r.revenue, r.units, r.sessions])).toEqual([
      ['2026-09-01', 'UK', 20.005, 2, 6],
      ['2026-09-01', 'US', 70, 7, 15],
      ['2026-09-02', 'US', 10, 1, 5],
    ])
  })

  it('the CSV names the currency and rounds money to cents', () => {
    const csv = toCsv(
      salesByMarketplaceDay(s, { start: '2026-09-01', end: '2026-09-01' }),
      salesDayColumns('GBP'),
    )
    expect(csv.split('\r\n')[0]).toBe('Date,Marketplace,Revenue (GBP),Orders,Units,Sessions')
    expect(csv.split('\r\n')[1]).toBe('2026-09-01,UK,20.01,2,2,6')
  })
})
