import { describe, expect, it, vi } from 'vitest'
import { StaticJsonDataSource, marketplaceView } from './dataSource'

function fakeFetch(files: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const name = url.split('/').pop()!
    const body = files[name]
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      json: async () => body,
    }
  })
}

describe('StaticJsonDataSource', () => {
  it('loads each file once and reuses it', async () => {
    const fetch = fakeFetch({ 'products.json': [{ asin: 'A1' }] })
    const ds = new StaticJsonDataSource('/data', fetch)
    await ds.products()
    await ds.products()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/data/products.json')
  })

  it('reports a missing file and retries on the next call', async () => {
    const fetch = fakeFetch({})
    const ds = new StaticJsonDataSource('/data/', fetch)
    await expect(ds.salesDaily()).rejects.toThrow('sales_daily.json (HTTP 404)')
    await expect(ds.salesDaily()).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refuses data with another schema version (1.0 files have no marketplace column)', async () => {
    const ds = new StaticJsonDataSource(
      '/data/',
      fakeFetch({ 'manifest.json': { schemaVersion: 1 } }),
    )
    await expect(ds.manifest()).rejects.toThrow('Unsupported data schema version 1')
  })

  it('a marketplace view shows one marketplace in every file', async () => {
    const files = {
      'marketplaces.json': [
        { marketplace: 'US', network: 'US' },
        { marketplace: 'DE', network: 'EU' },
        { marketplace: 'FR', network: 'EU' },
      ],
      'campaigns.json': [
        { campaign_id: '1', marketplace: 'US' },
        { campaign_id: '2', marketplace: 'DE' },
      ],
      'sales_daily.json': {
        date: ['d', 'd', 'd'],
        marketplace: ['US', 'DE', 'FR'],
        sales: [1, 2, 3],
      },
      'inventory_daily.json': { date: ['d', 'd'], network: ['US', 'EU'], available: [5, 6] },
    }
    const de = marketplaceView(new StaticJsonDataSource('/data/', fakeFetch(files)), 'DE')
    expect((await de.campaigns()).map((c) => c.campaign_id)).toEqual(['2'])
    expect((await de.salesDaily()).sales).toEqual([2])
    expect((await de.inventoryDaily()).available).toEqual([6]) // Germany sells from the EU pool
  })
})
