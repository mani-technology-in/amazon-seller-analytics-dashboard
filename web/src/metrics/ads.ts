/**
 * Advertising page metrics (FR-26): account ad KPIs and the ACoS and TACoS trend, for the
 * campaigns that pass the ad type and campaign filters. Files are already in one currency.
 */
import type { AdsCampaignDaily, OverviewDaily } from '../data/types'
import { inRange, type DateRange } from './dates'
import { ratio } from './metrics'
import { buckets, type Bucket } from './sales'

export interface AdKpis {
  adSpend: number
  adSales: number
  revenue: number
  acos: number | null
  tacos: number | null
  roas: number | null
}

/** Revenue for TACoS is all sales (every product, ad or not), from the overview file. */
export function adKpis(
  ads: AdsCampaignDaily,
  overview: OverviewDaily,
  range: DateRange,
  keep: (campaignId: string) => boolean = () => true,
): AdKpis {
  let adSpend = 0
  let adSales = 0
  for (let i = 0; i < ads.date.length; i++) {
    if (!inRange(ads.date[i], range) || !keep(ads.campaign_id[i])) continue
    adSpend += ads.cost[i]
    adSales += ads.sales[i]
  }
  let revenue = 0
  for (let i = 0; i < overview.date.length; i++) {
    if (inRange(overview.date[i], range)) revenue += overview.sales[i]
  }
  return {
    adSpend,
    adSales,
    revenue,
    acos: ratio(adSpend, adSales),
    tacos: ratio(adSpend, revenue),
    roas: ratio(adSales, adSpend),
  }
}

export interface AdTrendPoint extends Bucket {
  acos: number | null
  tacos: number | null
}

/** ACoS and TACoS per day, or per whole week beyond 60 days (as the Overview chart). */
export function adTrend(
  ads: AdsCampaignDaily,
  overview: OverviewDaily,
  range: DateRange,
  keep: (campaignId: string) => boolean = () => true,
): AdTrendPoint[] {
  return buckets(range).map((b) => {
    const k = adKpis(ads, overview, b, keep)
    return { ...b, acos: k.acos, tacos: k.tacos }
  })
}
