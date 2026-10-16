// Shapes of the JSON files written by pipeline/export.py.
// Fact files are column-oriented: one array per field, all the same length. Money is in the
// marketplace's own currency; metrics/currency.ts converts it.

export type ISODate = string // 'YYYY-MM-DD'
export type AdProduct = 'SP' | 'SB' | 'SD'
/** Amazon marketplace code; DE and FR share the EU fulfilment network. */
export type MarketplaceCode = 'US' | 'CA' | 'MX' | 'UK' | 'DE' | 'FR'
export type NetworkCode = 'US' | 'CA' | 'MX' | 'UK' | 'EU'
export type CurrencyCode = 'USD' | 'CAD' | 'MXN' | 'GBP' | 'EUR'

export interface Manifest {
  schemaVersion: number
  synthetic: boolean
  brand: string
  marketplace: string
  currency: string
  dataStart: ISODate
  dataEnd: ISODate
  generatedAt: string
  files: Record<string, { rows: number }>
}

export interface Product {
  asin: string
  sku: string
  title: string
  category: string
  price: number
  launch_date: ISODate
}

export interface Marketplace {
  marketplace: MarketplaceCode
  marketplace_id: string
  name: string
  currency: CurrencyCode
  network: NetworkCode
  has_ads: boolean
}

/** USD per unit of each non-USD currency, by month. */
export interface FxMonthly {
  year_month: string[] // 'YYYY-MM'
  currency: CurrencyCode[]
  usd_rate: number[]
}

export interface Campaign {
  campaign_id: string
  marketplace: MarketplaceCode
  campaign_name: string
  ad_product: AdProduct
  ad_product_name: string
  campaign_status: string
  budget: number | null
}

export interface Target {
  campaign_id: string
  marketplace: MarketplaceCode
  target_id: string
  ad_product: AdProduct
  target_text: string
  match_type: string
}

export interface SalesDaily {
  date: ISODate[]
  marketplace: MarketplaceCode[]
  asin: string[]
  units: number[]
  orders: number[]
  sales: number[]
  sessions: number[]
}

export interface AdsCampaignDaily {
  date: ISODate[]
  marketplace: MarketplaceCode[]
  campaign_id: string[]
  impressions: number[]
  clicks: number[]
  cost: number[]
  orders: number[]
  sales: number[]
  units: number[]
}

export interface AdsProductDaily {
  date: ISODate[]
  marketplace: MarketplaceCode[]
  asin: string[]
  impressions: number[]
  clicks: number[]
  cost: number[]
  orders: number[]
  sales: number[]
}

export interface AdsTargetDaily {
  date: ISODate[]
  marketplace: MarketplaceCode[]
  campaign_id: string[]
  target_id: string[]
  impressions: number[]
  clicks: number[]
  cost: number[]
  orders: number[]
  sales: number[]
}

export interface InventoryDaily {
  date: ISODate[]
  network: NetworkCode[]
  asin: string[]
  available: number[]
  reserved: number[]
  inbound: number[]
}

/** Amazon's money per product, marketplace and day (Finances API), local currency. */
export interface ProfitDaily {
  date: ISODate[]
  marketplace: MarketplaceCode[]
  asin: string[]
  units_shipped: number[]
  principal: number[]
  refunds: number[]
  referral_fees: number[]
  fba_fees: number[]
  /** the seller's own cost (not from Amazon), converted from USD at the month's rate */
  product_cost: number[]
}
