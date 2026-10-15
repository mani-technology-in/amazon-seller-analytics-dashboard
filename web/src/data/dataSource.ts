import type {
  AdsCampaignDaily,
  AdsProductDaily,
  AdsTargetDaily,
  Campaign,
  FxMonthly,
  InventoryDaily,
  Manifest,
  Marketplace,
  Product,
  ProfitDaily,
  SalesDaily,
  Target,
} from './types'
import type { MarketplaceCode } from './types'
import { forMarketplaces, forNetworks } from '../metrics/marketplace'

/**
 * Where the dashboard gets its data. Version 1 reads the static JSON files the pipeline exports
 * (StaticJsonDataSource). A later version can read the same shapes from an API without any page
 * changing.
 */
export interface DataSource {
  manifest(): Promise<Manifest>
  products(): Promise<Product[]>
  campaigns(): Promise<Campaign[]>
  targets(): Promise<Target[]>
  salesDaily(): Promise<SalesDaily>
  adsCampaignDaily(): Promise<AdsCampaignDaily>
  adsProductDaily(): Promise<AdsProductDaily>
  adsTargetDaily(): Promise<AdsTargetDaily>
  inventoryDaily(): Promise<InventoryDaily>
  marketplaces(): Promise<Marketplace[]>
  fxMonthly(): Promise<FxMonthly>
  profitDaily(): Promise<ProfitDaily>
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

const FILES = {
  manifest: 'manifest.json',
  products: 'products.json',
  campaigns: 'campaigns.json',
  targets: 'targets.json',
  salesDaily: 'sales_daily.json',
  adsCampaignDaily: 'ads_campaign_daily.json',
  adsProductDaily: 'ads_product_daily.json',
  adsTargetDaily: 'ads_target_daily.json',
  inventoryDaily: 'inventory_daily.json',
  marketplaces: 'marketplaces.json',
  fxMonthly: 'fx_monthly.json',
  profitDaily: 'profit_daily.json',
} as const

export const SUPPORTED_SCHEMA_VERSION = 2

/** Reads the exported JSON files once each and keeps them for the rest of the visit. */
export class StaticJsonDataSource implements DataSource {
  private cache = new Map<string, Promise<unknown>>()
  private readonly baseUrl: string
  private readonly fetchFn: Fetch

  constructor(baseUrl = `${import.meta.env.BASE_URL}data/`, fetchFn: Fetch = (u) => fetch(u)) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    this.fetchFn = fetchFn
  }

  private load<T>(file: string): Promise<T> {
    let pending = this.cache.get(file)
    if (!pending) {
      pending = this.fetchFn(this.baseUrl + file).then((res) => {
        if (!res.ok) throw new Error(`Could not load ${file} (HTTP ${res.status})`)
        return res.json()
      })
      // a failed load is retried on the next call rather than cached
      pending.catch(() => this.cache.delete(file))
      this.cache.set(file, pending)
    }
    return pending as Promise<T>
  }

  async manifest(): Promise<Manifest> {
    const m = await this.load<Manifest>(FILES.manifest)
    if (m.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      throw new Error(`Unsupported data schema version ${m.schemaVersion}`)
    }
    return m
  }

  products = () => this.load<Product[]>(FILES.products)
  campaigns = () => this.load<Campaign[]>(FILES.campaigns)
  targets = () => this.load<Target[]>(FILES.targets)
  salesDaily = () => this.load<SalesDaily>(FILES.salesDaily)
  adsCampaignDaily = () => this.load<AdsCampaignDaily>(FILES.adsCampaignDaily)
  adsProductDaily = () => this.load<AdsProductDaily>(FILES.adsProductDaily)
  adsTargetDaily = () => this.load<AdsTargetDaily>(FILES.adsTargetDaily)
  inventoryDaily = () => this.load<InventoryDaily>(FILES.inventoryDaily)
  marketplaces = () => this.load<Marketplace[]>(FILES.marketplaces)
  fxMonthly = () => this.load<FxMonthly>(FILES.fxMonthly)
  profitDaily = () => this.load<ProfitDaily>(FILES.profitDaily)
}

/**
 * The data source as one marketplace's pages see it: every file filtered to that marketplace
 * (inventory to its fulfilment network). The v1.0 pages use the US view until the pages with
 * the marketplace filter replace them (CR-1 PR 6); US money is already in USD.
 */
export function marketplaceView(source: DataSource, code: MarketplaceCode): DataSource {
  const one = new Set([code])
  const mine = <T extends { marketplace: MarketplaceCode }>(rows: T[]) =>
    rows.filter((r) => r.marketplace === code)
  return {
    ...source,
    manifest: () => source.manifest(),
    products: () => source.products(),
    marketplaces: () => source.marketplaces(),
    fxMonthly: () => source.fxMonthly(),
    campaigns: async () => mine(await source.campaigns()),
    targets: async () => mine(await source.targets()),
    salesDaily: async () => forMarketplaces(await source.salesDaily(), one),
    adsCampaignDaily: async () => forMarketplaces(await source.adsCampaignDaily(), one),
    adsProductDaily: async () => forMarketplaces(await source.adsProductDaily(), one),
    adsTargetDaily: async () => forMarketplaces(await source.adsTargetDaily(), one),
    profitDaily: async () => forMarketplaces(await source.profitDaily(), one),
    inventoryDaily: async () =>
      forNetworks(await source.inventoryDaily(), one, await source.marketplaces()),
  }
}
