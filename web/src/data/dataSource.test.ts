import { describe, expect, it } from 'vitest'
import { StaticJsonDataSource } from './dataSource'
import { fakeFetch } from './fakeFetch'

describe('StaticJsonDataSource', () => {
  it('loads each file once and reuses it', async () => {
    const fetch = fakeFetch({ 'products.json': [{ asin: 'A1' }] })
    const ds = new StaticJsonDataSource('/data', fetch)
    await ds.products()
    await ds.products()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/data/products.json')
  })

  it('reads fact files per marketplace, and inventory per fulfilment network', async () => {
    const fetch = fakeFetch({
      'mkt/DE/sales_daily.json': { sales: [1] },
      'net/EU/inventory_daily.json': { available: [2] },
    })
    const ds = new StaticJsonDataSource('/data/', fetch)
    expect(await ds.salesDaily('DE')).toEqual({ sales: [1] })
    expect(await ds.inventoryDaily('EU')).toEqual({ available: [2] })
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      '/data/mkt/DE/sales_daily.json',
      '/data/net/EU/inventory_daily.json',
    ])
  })

  it('reports a missing file and retries on the next call', async () => {
    const fetch = fakeFetch({})
    const ds = new StaticJsonDataSource('/data/', fetch)
    await expect(ds.salesDaily('US')).rejects.toThrow('mkt/US/sales_daily.json (HTTP 404)')
    await expect(ds.salesDaily('US')).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refuses data with another schema version (2.x files are not split by marketplace)', async () => {
    const ds = new StaticJsonDataSource(
      '/data/',
      fakeFetch({ 'manifest.json': { schemaVersion: 2 } }),
    )
    await expect(ds.manifest()).rejects.toThrow('Unsupported data schema version 2')
  })
})
