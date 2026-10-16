import { describe, expect, it } from 'vitest'
import type { FxMonthly, InventoryDaily, Marketplace, SalesDaily } from '../data/types'
import { FxRates, canShowLocal, toUsd } from './currency'
import { forMarketplaces, forNetworks, marketplaceShares, selectedCodes } from './marketplace'

const marketplaces: Marketplace[] = [
  {
    marketplace: 'US',
    marketplace_id: 'ATVPDKIKX0DER',
    name: 'United States',
    currency: 'USD',
    network: 'US',
    has_ads: true,
  },
  {
    marketplace: 'UK',
    marketplace_id: 'A1F83G8C2ARO7P',
    name: 'United Kingdom',
    currency: 'GBP',
    network: 'UK',
    has_ads: true,
  },
  {
    marketplace: 'DE',
    marketplace_id: 'A1PA6795UKMFR9',
    name: 'Germany',
    currency: 'EUR',
    network: 'EU',
    has_ads: true,
  },
  {
    marketplace: 'FR',
    marketplace_id: 'A13V1IB3VIYZZH',
    name: 'France',
    currency: 'EUR',
    network: 'EU',
    has_ads: false,
  },
]
const fx: FxMonthly = {
  year_month: ['2026-01', '2026-01', '2026-02', '2026-02'],
  currency: ['GBP', 'EUR', 'GBP', 'EUR'],
  usd_rate: [1.25, 1.1, 1.5, 1.2],
}
const rates = new FxRates(fx, marketplaces)

// Hand-checked: in USD, US 100 + UK 40 x 1.25 = 50 + DE 50 x 1.2 = 60 (February) = 210.
const sales: SalesDaily = {
  date: ['2026-01-31', '2026-01-31', '2026-02-01', '2026-02-01'],
  marketplace: ['US', 'UK', 'DE', 'FR'],
  asin: ['A1', 'A1', 'A1', 'A2'],
  units: [5, 2, 3, 0],
  orders: [4, 2, 2, 0],
  sales: [100, 40, 50, 0],
  sessions: [50, 20, 30, 1],
}

describe('marketplace filter (FR-17)', () => {
  it('"all" keeps every marketplace; a code keeps just that one', () => {
    expect([...selectedCodes('all')]).toEqual(['US', 'CA', 'MX', 'UK', 'DE', 'FR'])
    expect([...selectedCodes('UK')]).toEqual(['UK'])
  })

  it('keeps only the rows of the chosen marketplaces, in every column', () => {
    const uk = forMarketplaces(sales, selectedCodes('UK'))
    expect(uk).toEqual({
      date: ['2026-01-31'],
      marketplace: ['UK'],
      asin: ['A1'],
      units: [2],
      orders: [2],
      sales: [40],
      sessions: [20],
    })
    expect(forMarketplaces(sales, selectedCodes('all'))).toEqual(sales)
  })

  it('inventory follows the fulfilment network: Germany or France both mean the EU pool', () => {
    const inv: InventoryDaily = {
      date: ['2026-02-01', '2026-02-01', '2026-02-01'],
      network: ['US', 'UK', 'EU'],
      asin: ['A1', 'A1', 'A1'],
      available: [10, 20, 30],
      reserved: [0, 0, 0],
      inbound: [0, 0, 0],
    }
    expect(forNetworks(inv, selectedCodes('FR'), marketplaces).network).toEqual(['EU'])
    expect(forNetworks(inv, new Set(['DE', 'FR'] as const), marketplaces).available).toEqual([30])
    expect(forNetworks(inv, selectedCodes('all'), marketplaces).available).toEqual([10, 20, 30])
  })
})

describe('currency (FR-18)', () => {
  it('converts each amount at the rate for its own month; USD stays as it is', () => {
    expect(rates.usdRate('GBP', '2026-01-31')).toBe(1.25)
    expect(rates.usdRate('GBP', '2026-02-01')).toBe(1.5)
    expect(rates.usdRate('USD', '2026-02-01')).toBe(1)
    const usd = toUsd(sales, ['sales'], rates)
    expect(usd.sales).toEqual([100, 50, 60, 0])
    expect(usd.units).toEqual(sales.units) // counts are not money
    expect(sales.sales).toEqual([100, 40, 50, 0]) // the input is not changed
  })

  it('fails loudly when a month has no rate, rather than treating it as dollars', () => {
    const march = { ...sales, date: ['2026-03-01', '2026-03-01', '2026-03-01', '2026-03-01'] }
    expect(() => toUsd(march, ['sales'], rates)).toThrow(/No GBP rate for 2026-03/)
  })

  it('local currency is only offered when exactly one marketplace is chosen', () => {
    expect(canShowLocal(selectedCodes('UK'))).toBe(true)
    expect(canShowLocal(selectedCodes('all'))).toBe(false)
  })
})

describe('share of revenue by marketplace (FR-21)', () => {
  it('compares marketplaces in USD, so the shares add up to 100%', () => {
    const rows = marketplaceShares(toUsd(sales, ['sales'], rates), {
      start: '2026-01-01',
      end: '2026-02-28',
    })
    expect(rows.map((r) => [r.marketplace, r.revenue])).toEqual([
      ['US', 100],
      ['DE', 60],
      ['UK', 50],
      ['FR', 0],
    ])
    expect(rows.map((r) => r.share)).toEqual([100 / 210, 60 / 210, 50 / 210, 0])
    expect(rows.reduce((a, r) => a + (r.share ?? 0), 0)).toBeCloseTo(1, 12)
    expect(rows[0].aov).toBe(25)
    expect(rows[3].aov).toBeNull() // no orders: a dash, not 0 or NaN
  })

  it('has no shares when nothing sold', () => {
    const rows = marketplaceShares(toUsd(sales, ['sales'], rates), {
      start: '2025-01-01',
      end: '2025-01-31',
    })
    expect(rows).toEqual([])
  })
})
