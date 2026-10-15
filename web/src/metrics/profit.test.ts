import { describe, expect, it } from 'vitest'
import type { AdsCampaignDaily, AdsProductDaily, Product, ProfitDaily } from '../data/types'
import {
  accountProfit,
  marketplaceProfitRows,
  productProfitRows,
  profitTotals,
  profitWaterfall,
} from './profit'

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
  { asin: 'A3', sku: 'S3', title: 'Three', category: 'Bath', price: 10, launch_date: '2024-01-01' },
]
// Already in one currency (the metrics take converted files). Hand-checked below.
const profit: ProfitDaily = {
  date: ['2026-01-01', '2026-01-02', '2026-01-01', '2026-01-05'],
  marketplace: ['US', 'US', 'UK', 'US'],
  asin: ['A1', 'A1', 'A2', 'A3'],
  units_shipped: [10, 0, 5, 0],
  principal: [200, 0, 50, 0],
  refunds: [0, 20, 0, 0],
  referral_fees: [30, -2.4, 7.5, 0], // a refund returns 3.00 of fee, less 0.60 kept by Amazon
  fba_fees: [40, 0, 20, 0],
  product_cost: [70, 0, 15, 0],
}
const adsProduct: AdsProductDaily = {
  date: ['2026-01-01', '2026-01-01', '2026-02-01'],
  marketplace: ['US', 'UK', 'US'],
  asin: ['A1', 'A2', 'A1'],
  impressions: [100, 100, 100],
  clicks: [10, 10, 10],
  cost: [30, 15, 99],
  orders: [1, 1, 1],
  sales: [20, 10, 20],
}
const range = { start: '2026-01-01', end: '2026-01-31' }

describe('product profit (FR-28, FR-29)', () => {
  const rows = productProfitRows(profit, adsProduct, products, range)
  const one = rows.find((r) => r.asin === 'A1')!
  const two = rows.find((r) => r.asin === 'A2')!

  it('net profit = revenue - refunds - Amazon fees - ad spend - product cost', () => {
    expect(one).toMatchObject({
      units: 10,
      revenue: 200,
      refunds: 20,
      referralFees: 27.6,
      fbaFees: 40,
      amazonFees: 67.6,
      adSpend: 30, // February's 99 is outside the range
      productCost: 70,
      losesMoney: false,
    })
    expect(one.netProfit).toBeCloseTo(12.4, 10)
    expect(one.netMargin).toBeCloseTo(0.062, 10)
    expect(one.profitPerUnit).toBeCloseTo(1.24, 10)
  })

  it('flags a product that loses money, with a negative margin', () => {
    expect(two.netProfit).toBeCloseTo(-7.5, 10)
    expect(two.netMargin).toBeCloseTo(-0.15, 10)
    expect(two.profitPerUnit).toBeCloseTo(-1.5, 10)
    expect(two.losesMoney).toBe(true)
  })

  it('shows a dash, not 0 or NaN, when there is no revenue or no units', () => {
    const three = rows.find((r) => r.asin === 'A3')!
    expect(three.netMargin).toBeNull()
    expect(three.profitPerUnit).toBeNull()
    expect(three.losesMoney).toBe(false)
  })

  it('lists only products with sales, refunds or ad spend in the range', () => {
    expect(
      productProfitRows(profit, adsProduct, products, { start: '2027-01-01', end: '2027-01-31' }),
    ).toEqual([])
  })
})

describe('profit totals and the revenue-to-profit chart (FR-27, FR-30)', () => {
  const totals = profitTotals(productProfitRows(profit, adsProduct, products, range))

  it('totals are the sum of the product rows', () => {
    expect(totals.revenue).toBe(250)
    expect(totals.amazonFees).toBeCloseTo(95.1, 10)
    expect(totals.adSpend).toBe(45)
    expect(totals.productCost).toBe(85)
    expect(totals.netProfit).toBeCloseTo(4.9, 10)
    expect(totals.netMargin).toBeCloseTo(4.9 / 250, 10)
  })

  it('the account view also counts ad spend Amazon reports per campaign only', () => {
    const campaigns: AdsCampaignDaily = {
      date: ['2026-01-01', '2026-01-01', '2026-01-01'],
      marketplace: ['US', 'US', 'UK'],
      campaign_id: ['SP1', 'SB1', 'SP2'],
      impressions: [1, 1, 1],
      clicks: [1, 1, 1],
      cost: [30, 10, 15], // SB1's 10 has no product
      orders: [1, 1, 1],
      sales: [1, 1, 1],
      units: [1, 1, 1],
    }
    const account = accountProfit(profit, campaigns, range)
    expect(account.adSpend).toBe(55)
    expect(account.netProfit).toBeCloseTo(4.9 - 10, 10)
    expect(account.revenue).toBe(totals.revenue)
  })

  it('the chart walks from revenue to net profit, each cost one step down', () => {
    const steps = profitWaterfall(totals)
    expect(steps.map((s) => s.label)).toEqual([
      'Revenue',
      'Refunds',
      'Referral fees',
      'FBA fees',
      'Ad spend',
      'Product cost',
      'Net profit',
    ])
    expect(steps[0]).toMatchObject({ kind: 'total', from: 0, to: 250 })
    expect(steps[1]).toMatchObject({ kind: 'cost', from: 250, to: 230 })
    for (let i = 1; i < steps.length - 1; i++)
      expect(steps[i].from).toBeCloseTo(steps[i - 1].to, 10)
    expect(steps[5].to).toBeCloseTo(4.9, 10)
    expect(steps[6]).toMatchObject({ kind: 'total', from: 0 })
    expect(steps[6].to).toBeCloseTo(4.9, 10)
  })
})

describe('profit by marketplace (FR-28)', () => {
  it('splits the same lines by marketplace', () => {
    const rows = marketplaceProfitRows(profit, adsProduct, range)
    expect(rows.map((r) => [r.marketplace, r.revenue, r.adSpend])).toEqual([
      ['US', 200, 30],
      ['UK', 50, 15],
    ])
    expect(rows[1].netProfit).toBeCloseTo(-7.5, 10)
  })
})
