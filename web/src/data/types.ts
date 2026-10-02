// Shapes of the JSON files written by pipeline/export.py.
// Fact files are column-oriented: one array per field, all the same length.

export type ISODate = string // 'YYYY-MM-DD'
export type AdProduct = 'SP' | 'SB' | 'SD'

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

export interface Campaign {
  campaign_id: string
  campaign_name: string
  ad_product: AdProduct
  ad_product_name: string
  campaign_status: string
  budget: number | null
}

export interface Target {
  campaign_id: string
  target_id: string
  ad_product: AdProduct
  target_text: string
  match_type: string
}

export interface SalesDaily {
  date: ISODate[]
  asin: string[]
  units: number[]
  orders: number[]
  sales: number[]
  sessions: number[]
  page_views: number[]
}

export interface AdsCampaignDaily {
  date: ISODate[]
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
  asin: string[]
  impressions: number[]
  clicks: number[]
  cost: number[]
  orders: number[]
  sales: number[]
}

export interface AdsTargetDaily {
  date: ISODate[]
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
  asin: string[]
  available: number[]
  reserved: number[]
  inbound: number[]
}
