import type {
  AdsCampaignDaily,
  AdsProductDaily,
  AdsTargetDaily,
  Campaign,
  InventoryDaily,
  Manifest,
  Product,
  SalesDaily,
  Target,
} from './types'

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
} as const

export const SUPPORTED_SCHEMA_VERSION = 1

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
}
