import { describe, expect, it, vi } from 'vitest'
import { StaticJsonDataSource } from './dataSource'

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

  it('refuses data with an unknown schema version', async () => {
    const ds = new StaticJsonDataSource(
      '/data/',
      fakeFetch({ 'manifest.json': { schemaVersion: 2 } }),
    )
    await expect(ds.manifest()).rejects.toThrow('Unsupported data schema version 2')
  })
})
