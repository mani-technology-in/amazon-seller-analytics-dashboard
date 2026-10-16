import { describe, expect, it } from 'vitest'
import { fakeFetch } from './fakeFetch'
import { StaticJsonDataSource } from './dataSource'
import { concatColumns, selectData } from './selection'

const files = {
  'marketplaces.json': [
    { marketplace: 'US', currency: 'USD', network: 'US' },
    { marketplace: 'UK', currency: 'GBP', network: 'UK' },
    { marketplace: 'DE', currency: 'EUR', network: 'EU' },
    { marketplace: 'FR', currency: 'EUR', network: 'EU' },
  ],
  'fx_monthly.json': {
    year_month: ['2026-01', '2026-01'],
    currency: ['GBP', 'EUR'],
    usd_rate: [1.25, 1.1],
  },
  'campaigns.json': [
    { campaign_id: '1', marketplace: 'US' },
    { campaign_id: '2', marketplace: 'DE' },
    { campaign_id: '3', marketplace: 'UK' },
  ],
  'overview_daily.json': {
    date: ['2026-01-01', '2026-01-01', '2026-01-01'],
    marketplace: ['US', 'UK', 'DE'],
    sales: [100, 40, 10],
    orders: [5, 2, 1],
    units: [6, 2, 1],
    sessions: [50, 20, 9],
    ad_spend: [10, 8, 0],
    ad_sales: [30, 16, 0],
  },
  'profit_summary_daily.json': {
    date: ['2026-01-01', '2026-01-01', '2026-01-01'],
    marketplace: ['US', 'UK', 'DE'],
    units_shipped: [6, 2, 1],
    principal: [100, 40, 10],
    refunds: [0, 4, 0],
    referral_fees: [15, 6, 1.5],
    fba_fees: [10, 4, 1],
    product_cost: [30, 12, 3],
  },
  'mkt/US/sales_daily.json': {
    date: ['2026-01-01'],
    marketplace: ['US'],
    asin: ['A1'],
    units: [6],
    orders: [5],
    sales: [100],
    sessions: [50],
  },
  'mkt/UK/sales_daily.json': {
    date: ['2026-01-01', '2026-01-02'],
    marketplace: ['UK', 'UK'],
    asin: ['A1', 'A2'],
    units: [1, 1],
    orders: [1, 1],
    sales: [20, 20],
    sessions: [9, 9],
  },
  'inventory_summary_daily.json': {
    date: ['d', 'd', 'd'],
    network: ['US', 'UK', 'EU'],
    available: [5, 7, 6],
    inbound: [1, 1, 1],
  },
  'net/US/inventory_daily.json': { date: ['d'], network: ['US'], available: [5] },
  'net/EU/inventory_daily.json': { date: ['d'], network: ['EU'], available: [6] },
}

function source() {
  const fetch = fakeFetch(files)
  return { fetch, ds: new StaticJsonDataSource('/data/', fetch) }
}

describe('choosing marketplaces and currency (FR-17, FR-18)', () => {
  it('joins the chosen marketplaces and converts money to USD', async () => {
    const data = selectData(source().ds, { marketplaces: ['US', 'UK'], currency: 'usd' })
    const sales = await data.salesDaily()
    expect(sales.marketplace).toEqual(['US', 'UK', 'UK'])
    expect(sales.sales).toEqual([100, 25, 25])
    expect(sales.units).toEqual([6, 1, 1]) // counts are not money
  })

  it('downloads only the files of the chosen marketplaces', async () => {
    const { fetch, ds } = source()
    await selectData(ds, { marketplaces: ['UK'], currency: 'local' }).salesDaily()
    const urls = fetch.mock.calls.map((c) => c[0])
    expect(urls).toEqual(['/data/mkt/UK/sales_daily.json'])
  })

  it('local currency leaves the amounts as they are, for one marketplace only', async () => {
    const uk = selectData(source().ds, { marketplaces: ['UK'], currency: 'local' })
    expect((await uk.salesDaily()).sales).toEqual([20, 20])
    const two = selectData(source().ds, { marketplaces: ['US', 'UK'], currency: 'local' })
    await expect(two.salesDaily()).rejects.toThrow('exactly one marketplace')
  })

  it('the overview file is filtered to the chosen marketplaces and converted', async () => {
    const data = selectData(source().ds, { marketplaces: ['UK', 'DE'], currency: 'usd' })
    const o = await data.overviewDaily()
    expect(o.marketplace).toEqual(['UK', 'DE'])
    expect(o.sales).toEqual([50, 11])
    expect(o.ad_spend).toEqual([10, 0])
    expect(o.orders).toEqual([2, 1])
    const p = await data.profitSummaryDaily()
    expect(p.marketplace).toEqual(['UK', 'DE'])
    expect(p.refunds).toEqual([5, 0])
    expect(p.units_shipped).toEqual([2, 1]) // counts are not money
  })

  it('stock sales cover every marketplace a chosen network serves (France shares EU stock)', async () => {
    const fr = { ...files, 'mkt/DE/sales_daily.json': files['mkt/UK/sales_daily.json'] }
    const fetch = fakeFetch({
      ...fr,
      'mkt/FR/sales_daily.json': { ...files['mkt/US/sales_daily.json'], marketplace: ['FR'] },
    })
    const data = selectData(new StaticJsonDataSource('/data/', fetch), {
      marketplaces: ['FR'],
      currency: 'local',
    })
    const urls = () => fetch.mock.calls.map((c) => c[0])
    expect((await data.stockSalesDaily()).units).toEqual([1, 1, 6]) // DE then FR
    expect(urls()).toContain('/data/mkt/DE/sales_daily.json')
    expect((await data.salesDaily()).units).toEqual([6]) // the pages still show France only
  })

  it('campaigns are filtered; inventory comes from each chosen fulfilment network once', async () => {
    const data = selectData(source().ds, { marketplaces: ['US', 'DE', 'FR'], currency: 'usd' })
    expect((await data.campaigns()).map((c) => c.campaign_id)).toEqual(['1', '2'])
    expect((await data.inventoryDaily()).available).toEqual([5, 6]) // DE and FR share the EU pool
    expect((await data.inventorySummaryDaily()).network).toEqual(['US', 'EU'])
  })
})

describe('concatColumns', () => {
  it('puts files of the same shape one after another, and leaves a single file as it is', () => {
    const a = { x: [1], y: ['a'] }
    expect(concatColumns([a, { x: [2, 3], y: ['b', 'c'] }])).toEqual({
      x: [1, 2, 3],
      y: ['a', 'b', 'c'],
    })
    expect(concatColumns([a])).toBe(a)
  })

  it('refuses no files, or files whose columns differ, rather than joining them wrongly', () => {
    expect(() => concatColumns([])).toThrow('No files')
    expect(() => concatColumns([{ x: [1] }, { y: [2] }] as object[])).toThrow('different columns')
  })

  it('joins empty files (no ads in a marketplace) without adding rows', () => {
    expect(concatColumns([{ x: [1] }, { x: [] }])).toEqual({ x: [1] })
  })
})

describe('selectData', () => {
  it('refuses an empty choice of marketplaces', () => {
    expect(() => selectData(source().ds, { marketplaces: [], currency: 'usd' })).toThrow(
      'at least one marketplace',
    )
  })
})
