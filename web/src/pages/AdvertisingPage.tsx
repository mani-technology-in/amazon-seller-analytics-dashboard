import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useDatasets } from '../app/useDatasets'
import { useFilters } from '../app/filters'
import { DataTable, type Column } from '../components/DataTable'
import { KpiTile } from '../components/KpiTile'
import { TrendChart } from '../components/TrendChart'
import { FilterBar } from '../components/FilterBar'
import { Flag } from '../components/Flag'
import { ErrorBox, Loading, PageTitle } from '../components/Layout'
import type { Manifest } from '../data/types'
import { useMoney } from '../app/money'
import { count, multiple, pct } from '../lib/format'
import { adKpis, adTrend } from '../metrics/ads'
import { MARKETPLACE_NAMES } from '../metrics/marketplace'
import {
  campaignRows,
  topBy,
  targetKey,
  targetRows,
  type CampaignRow,
  type TargetRow,
} from '../metrics/metrics'

const pct0 = (v: number | null) => pct(v, 0)

const MATCH_LABELS: Record<string, string> = {
  EXACT: 'Exact',
  PHRASE: 'Phrase',
  BROAD: 'Broad',
  TARGETING_EXPRESSION_PREDEFINED: 'Auto',
  AUDIENCE: 'Audience',
  PRODUCT: 'Product',
}

export function AdvertisingPage() {
  const manifest = useOutletContext<Manifest>()
  const { filters, update } = useFilters(manifest.dataStart, manifest.dataEnd)
  const { money, moneyCents } = useMoney()
  const base = useDatasets('adsCampaignDaily', 'campaigns', 'overviewDaily')
  const keywords = useDatasets('adsTargetDaily', 'targets', 'campaigns')
  const [flaggedOnly, setFlaggedOnly] = useState(false)

  const adFilter = useMemo(
    () => ({
      adProducts: filters.adProducts,
      campaignIds: filters.campaignId ? [filters.campaignId] : undefined,
    }),
    [filters.adProducts, filters.campaignId],
  )

  const campaigns = useMemo(
    () =>
      base.status === 'ready'
        ? campaignRows(base.data.adsCampaignDaily, base.data.campaigns, filters.range, adFilter)
        : null,
    [base, filters.range, adFilter],
  )

  const summary = useMemo(() => {
    if (base.status !== 'ready' || !campaigns) return null
    const d = base.data
    // the same campaigns as the table, also in the previous period
    const allowed = new Set(
      d.campaigns
        .filter(
          (c) =>
            (!adFilter.adProducts.length || adFilter.adProducts.includes(c.ad_product)) &&
            (!adFilter.campaignIds || adFilter.campaignIds.includes(c.campaign_id)),
        )
        .map((c) => c.campaign_id),
    )
    const keep = (id: string) => allowed.has(id)
    const range = filters.range
    const previous = filters.previous
    return {
      kpis: adKpis(d.adsCampaignDaily, d.overviewDaily, range, keep),
      prev: previous ? adKpis(d.adsCampaignDaily, d.overviewDaily, previous, keep) : null,
      trend: adTrend(d.adsCampaignDaily, d.overviewDaily, range, keep),
      top: topBy(campaigns, (c) => c.cost),
    }
  }, [base, campaigns, adFilter, filters.range, filters.previous])

  const targets = useMemo(() => {
    if (keywords.status !== 'ready') return null
    const k = keywords.data
    return targetRows(
      k.adsTargetDaily,
      k.targets,
      k.campaigns,
      filters.range,
      filters.targetAcos,
      adFilter,
    ).filter((t) => t.impressions > 0)
  }, [keywords, filters.range, filters.targetAcos, adFilter])

  if (base.status === 'error') return <ErrorBox error={base.error} />

  const shown =
    targets && flaggedOnly ? targets.filter((t) => t.noSales || t.acosAboveTarget) : targets
  const noSales = targets?.filter((t) => t.noSales) ?? []
  const wasted = noSales.reduce((s, t) => s + t.cost, 0)
  const overTarget = targets?.filter((t) => t.acosAboveTarget).length ?? 0
  const target = pct(filters.targetAcos, 0)
  const noAdsText =
    filters.marketplace !== 'all' && !['US', 'UK', 'DE'].includes(filters.marketplace)
      ? `No ads ran in ${MARKETPLACE_NAMES[filters.marketplace]}: ads run in the US, the UK and Germany.`
      : undefined

  return (
    <>
      <PageTitle title="Advertising">
        Which ads earn their spend. Ads run in the US, the UK and Germany. Ad sales use Amazon's
        attribution: 7 days for Sponsored Products, 14 days for Sponsored Brands and Sponsored
        Display.
      </PageTitle>
      <FilterBar
        filters={filters}
        update={update}
        dataStart={manifest.dataStart}
        dataEnd={manifest.dataEnd}
        campaigns={base.status === 'ready' ? base.data.campaigns : []}
        showTargetAcos
      />
      {!campaigns || !summary ? (
        <Loading />
      ) : (
        <>
          <AdSummary
            {...summary}
            compare={filters.compare}
            targetAcos={filters.targetAcos}
            money={money}
            weekly={summary.trend.length > 0 && summary.trend[0].start !== summary.trend[0].end}
          />
          <DataTable<CampaignRow>
            title="Campaigns"
            rows={campaigns}
            rowKey={(r) => r.campaign_id}
            csvName="campaigns.csv"
            initialSort={{ id: 'cost', desc: true }}
            columns={
              [
                { id: 'name', header: 'Campaign', value: (r) => r.campaign_name },
                {
                  id: 'marketplace',
                  header: 'Marketplace',
                  value: (r) => r.marketplace,
                  hint: 'Ads run in the US, the UK and Germany',
                },
                {
                  id: 'type',
                  header: 'Type',
                  value: (r) => r.ad_product,
                  hint: 'SP = Sponsored Products, SB = Sponsored Brands, SD = Sponsored Display',
                },
                {
                  id: 'cost',
                  header: 'Spend',
                  value: (r) => r.cost,
                  cell: (r) => money(r.cost),
                  align: 'right',
                },
                {
                  id: 'sales',
                  header: 'Ad sales',
                  value: (r) => r.sales,
                  cell: (r) => money(r.sales),
                  align: 'right',
                },
                {
                  id: 'acos',
                  header: 'ACoS',
                  value: (r) => r.acos,
                  cell: (r) => <AcosCell acos={r.acos} target={filters.targetAcos} />,
                  align: 'right',
                  hint: `Ad spend ÷ ad sales; flagged above the ${target} target`,
                },
                {
                  id: 'roas',
                  header: 'ROAS',
                  value: (r) => r.roas,
                  cell: (r) => multiple(r.roas),
                  align: 'right',
                },
                {
                  id: 'impressions',
                  header: 'Impressions',
                  value: (r) => r.impressions,
                  cell: (r) => count(r.impressions),
                  align: 'right',
                },
                {
                  id: 'clicks',
                  header: 'Clicks',
                  value: (r) => r.clicks,
                  cell: (r) => count(r.clicks),
                  align: 'right',
                },
                {
                  id: 'ctr',
                  header: 'CTR',
                  value: (r) => r.ctr,
                  cell: (r) => pct(r.ctr, 2),
                  align: 'right',
                },
                {
                  id: 'cpc',
                  header: 'CPC',
                  value: (r) => r.cpc,
                  cell: (r) => moneyCents(r.cpc),
                  align: 'right',
                },
                {
                  id: 'orders',
                  header: 'Orders',
                  value: (r) => r.orders,
                  cell: (r) => count(r.orders),
                  align: 'right',
                },
                {
                  id: 'cvr',
                  header: 'Conv. rate',
                  value: (r) => r.cvr,
                  cell: (r) => pct(r.cvr),
                  align: 'right',
                  hint: 'Ad orders ÷ clicks',
                },
              ] satisfies Column<CampaignRow>[]
            }
          />
        </>
      )}

      {keywords.status === 'error' ? (
        <ErrorBox error={keywords.error} />
      ) : !shown ? (
        <Loading what="keywords and targets" />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-body" aria-label="Keyword flags">
            <div className="rounded-lg border border-surface-sunken bg-surface-page px-4 py-3">
              <Flag kind="critical" label="Spend with no sales" />
              <div className="mt-1 text-ink-2">
                <strong className="tabular-nums">{noSales.length}</strong> keywords and targets,{' '}
                <strong className="tabular-nums">{money(wasted)}</strong> spent with no attributed
                sale
              </div>
            </div>
            <div className="rounded-lg border border-surface-sunken bg-surface-page px-4 py-3">
              <Flag kind="warning" label={`ACoS above ${target}`} />
              <div className="mt-1 text-ink-2">
                <strong className="tabular-nums">{overTarget}</strong> keywords and targets above
                the target
              </div>
            </div>
          </div>
          <DataTable<TargetRow>
            title="Keywords and targets"
            rows={shown}
            emptyText={noAdsText}
            rowKey={(r) => targetKey(r.campaign_id, r.target_id)}
            csvName="keywords-and-targets.csv"
            initialSort={{ id: 'cost', desc: true }}
            toolbar={
              <label className="flex min-h-9 items-center gap-1.5 text-caption text-ink-2">
                <input
                  type="checkbox"
                  checked={flaggedOnly}
                  onChange={(e) => setFlaggedOnly(e.target.checked)}
                />
                Flagged only
              </label>
            }
            columns={
              [
                { id: 'text', header: 'Keyword or target', value: (r) => r.target_text },
                {
                  id: 'match',
                  header: 'Match',
                  value: (r) => MATCH_LABELS[r.match_type] ?? r.match_type,
                },
                { id: 'campaign', header: 'Campaign', value: (r) => r.campaign_name },
                { id: 'marketplace', header: 'Marketplace', value: (r) => r.marketplace },
                {
                  id: 'cost',
                  header: 'Spend',
                  value: (r) => r.cost,
                  cell: (r) => money(r.cost),
                  align: 'right',
                },
                {
                  id: 'sales',
                  header: 'Ad sales',
                  value: (r) => r.sales,
                  cell: (r) => money(r.sales),
                  align: 'right',
                },
                {
                  id: 'acos',
                  header: 'ACoS',
                  value: (r) => r.acos,
                  cell: (r) => <AcosCell acos={r.acos} target={filters.targetAcos} />,
                  align: 'right',
                },
                {
                  id: 'clicks',
                  header: 'Clicks',
                  value: (r) => r.clicks,
                  cell: (r) => count(r.clicks),
                  align: 'right',
                },
                {
                  id: 'orders',
                  header: 'Orders',
                  value: (r) => r.orders,
                  cell: (r) => count(r.orders),
                  align: 'right',
                },
                {
                  id: 'cpc',
                  header: 'CPC',
                  value: (r) => r.cpc,
                  cell: (r) => moneyCents(r.cpc),
                  align: 'right',
                },
                {
                  id: 'flag',
                  header: 'Flag',
                  value: (r) =>
                    r.noSales
                      ? 'Spend with no sales'
                      : r.acosAboveTarget
                        ? `ACoS above ${target}`
                        : null,
                  cell: (r) =>
                    r.noSales ? (
                      <Flag kind="critical" label="No sales" />
                    ) : r.acosAboveTarget ? (
                      <Flag kind="warning" label="High ACoS" />
                    ) : null,
                },
              ] satisfies Column<TargetRow>[]
            }
          />
        </>
      )}
    </>
  )
}

function AcosCell({ acos, target }: { acos: number | null; target: number }) {
  if (acos !== null && acos > target) {
    return (
      <span className="font-medium text-critical">
        <span aria-hidden="true">▲ </span>
        {pct(acos)}
        <span className="sr-only"> (above target)</span>
      </span>
    )
  }
  return <>{pct(acos)}</>
}

function AdSummary({
  kpis: k,
  prev: p,
  trend,
  top,
  compare,
  targetAcos,
  money,
  weekly,
}: {
  kpis: ReturnType<typeof adKpis>
  prev: ReturnType<typeof adKpis> | null
  trend: ReturnType<typeof adTrend>
  top: CampaignRow[]
  compare: boolean
  targetAcos: number
  money: (v: number | null) => string
  weekly: boolean
}) {
  const prev = (v: number | null | undefined) => (compare ? (p ? v : null) : undefined)
  // stable chart inputs: a new object would rebuild the chart on every render
  const chart = useMemo(
    () => ({
      dates: trend.map((t) => t.start),
      series: [
        { name: 'ACoS', values: trend.map((t) => t.acos) },
        { name: 'TACoS', values: trend.map((t) => t.tacos) },
      ],
      reference: { value: targetAcos, label: `Target ACoS ${pct(targetAcos, 0)}` },
    }),
    [trend, targetAcos],
  )
  return (
    <>
      <section
        aria-label="Key figures"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        <KpiTile
          label="Ad spend"
          value={money(k.adSpend)}
          current={k.adSpend}
          previous={prev(p?.adSpend)}
          better="neutral"
        />
        <KpiTile
          label="Ad sales"
          value={money(k.adSales)}
          current={k.adSales}
          previous={prev(p?.adSales)}
          better="up"
        />
        <KpiTile
          label="ACoS"
          value={pct(k.acos)}
          current={k.acos}
          previous={prev(p?.acos)}
          better="down"
          points
          hint="Ad spend ÷ ad sales"
        />
        <KpiTile
          label="TACoS"
          value={pct(k.tacos)}
          current={k.tacos}
          previous={prev(p?.tacos)}
          better="down"
          points
          hint="Ad spend ÷ all revenue, with or without an ad"
        />
        <KpiTile
          label="ROAS"
          value={multiple(k.roas)}
          current={k.roas}
          previous={prev(p?.roas)}
          better="up"
          hint="Ad sales ÷ ad spend"
        />
      </section>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <TrendChart
          title={weekly ? 'ACoS and TACoS, weekly' : 'ACoS and TACoS'}
          dates={chart.dates}
          series={chart.series}
          format={pct0}
          reference={chart.reference}
        />
        <section
          aria-labelledby="top-campaigns"
          className="rounded-lg border border-surface-sunken bg-surface-page px-[18px] pt-4 pb-3.5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="top-campaigns" className="text-section-title text-ink">
              Top 5 campaigns by spend
            </h2>
            <span className="font-mono text-chart-label text-ink-3 uppercase">Spend · ACoS</span>
          </div>
          {top.length ? (
            <ol className="mt-2">
              {top.map((c) => (
                <li
                  key={c.campaign_id}
                  className="flex items-baseline gap-3 border-t border-surface-sunken py-2.5 first:border-t-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body" title={c.campaign_name}>
                      {c.campaign_name}
                    </span>
                    <span className="block text-caption text-ink-3">
                      {MARKETPLACE_NAMES[c.marketplace]}
                    </span>
                  </span>
                  <span className="font-mono text-table-number text-ink-2 tabular-nums">
                    {money(c.cost)}
                  </span>
                  <span className="w-16 text-right font-mono text-table-number tabular-nums">
                    <AcosCell acos={c.acos} target={targetAcos} />
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-small text-ink-3">No ads ran for these filters.</p>
          )}
        </section>
      </div>
    </>
  )
}
