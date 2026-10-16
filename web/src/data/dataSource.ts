import type {
  AdsCampaignDaily,
  AdsProductDaily,
  AdsTargetDaily,
  Campaign,
  FxMonthly,
  InventoryDaily,
  InventorySummaryDaily,
  Manifest,
  Marketplace,
  MarketplaceCode,
  NetworkCode,
  OverviewDaily,
  Product,
  ProfitSummaryDaily,
  ProfitDaily,
  SalesDaily,
  Target,
} from './types'

/**
 * Where the dashboard gets its data. StaticJsonDataSource reads the JSON files the pipeline
 * exports; a later version can read the same shapes from an API without any page changing.
 * Fact files come one marketplace (inventory: one fulfilment network) at a time, so a page
 * downloads only what it shows; data/selection.ts combines them for the chosen marketplaces.
 */
export interface DataSource {
  manifest(): Promise<Manifest>
  products(): Promise<Product[]>
  campaigns(): Promise<Campaign[]>
  targets(): Promise<Target[]>
  marketplaces(): Promise<Marketplace[]>
  fxMonthly(): Promise<FxMonthly>
  overviewDaily(): Promise<OverviewDaily>
  profitSummaryDaily(): Promise<ProfitSummaryDaily>
  inventorySummaryDaily(): Promise<InventorySummaryDaily>
  salesDaily(m: MarketplaceCode): Promise<SalesDaily>
  adsCampaignDaily(m: MarketplaceCode): Promise<AdsCampaignDaily>
  adsProductDaily(m: MarketplaceCode): Promise<AdsProductDaily>
  adsTargetDaily(m: MarketplaceCode): Promise<AdsTargetDaily>
  profitDaily(m: MarketplaceCode): Promise<ProfitDaily>
  inventoryDaily(n: NetworkCode): Promise<InventoryDaily>
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export const SUPPORTED_SCHEMA_VERSION = 3

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
    const m = await this.load<Manifest>('manifest.json')
    if (m.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      throw new Error(`Unsupported data schema version ${m.schemaVersion}`)
    }
    return m
  }

  products = () => this.load<Product[]>('products.json')
  campaigns = () => this.load<Campaign[]>('campaigns.json')
  targets = () => this.load<Target[]>('targets.json')
  marketplaces = () => this.load<Marketplace[]>('marketplaces.json')
  fxMonthly = () => this.load<FxMonthly>('fx_monthly.json')
  overviewDaily = () => this.load<OverviewDaily>('overview_daily.json')
  profitSummaryDaily = () => this.load<ProfitSummaryDaily>('profit_summary_daily.json')
  inventorySummaryDaily = () => this.load<InventorySummaryDaily>('inventory_summary_daily.json')
  salesDaily = (m: MarketplaceCode) => this.load<SalesDaily>(`mkt/${m}/sales_daily.json`)
  adsCampaignDaily = (m: MarketplaceCode) =>
    this.load<AdsCampaignDaily>(`mkt/${m}/ads_campaign_daily.json`)
  adsProductDaily = (m: MarketplaceCode) =>
    this.load<AdsProductDaily>(`mkt/${m}/ads_product_daily.json`)
  adsTargetDaily = (m: MarketplaceCode) =>
    this.load<AdsTargetDaily>(`mkt/${m}/ads_target_daily.json`)
  profitDaily = (m: MarketplaceCode) => this.load<ProfitDaily>(`mkt/${m}/profit_daily.json`)
  inventoryDaily = (n: NetworkCode) => this.load<InventoryDaily>(`net/${n}/inventory_daily.json`)
}
