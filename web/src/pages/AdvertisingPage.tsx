import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useDatasets } from '../app/useDatasets'
import { useFilters } from '../app/filters'
import { DataTable, type Column } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { Flag } from '../components/Flag'
import { ErrorBox, Loading, PageTitle } from '../components/Layout'
import type { Manifest } from '../data/types'
import { count, money, moneyCents, multiple, pct } from '../lib/format'
import {
  campaignRows,
  targetKey,
  targetRows,
  type CampaignRow,
  type TargetRow,
} from '../metrics/metrics'

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
  const base = useDatasets('adsCampaignDaily', 'campaigns')
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

  return (
    <>
      <PageTitle title="Advertising">
        Campaigns, keywords and targets across Sponsored Products, Sponsored Brands and Sponsored
        Display. Ad sales use Amazon's attribution: 7 days for Sponsored Products, 14 days for
        Sponsored Brands and Sponsored Display.
      </PageTitle>
      <FilterBar
        filters={filters}
        update={update}
        dataStart={manifest.dataStart}
        dataEnd={manifest.dataEnd}
        showCompare={false}
        campaigns={base.status === 'ready' ? base.data.campaigns : []}
        showTargetAcos
      />
      {!campaigns ? (
        <Loading />
      ) : (
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
      )}

      {keywords.status === 'error' ? (
        <ErrorBox error={keywords.error} />
      ) : !shown ? (
        <Loading what="keywords and targets" />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-sm" aria-label="Keyword flags">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <Flag kind="critical" label="Spend with no sales" />
              <div className="mt-1 text-slate-700">
                <strong className="tabular-nums">{noSales.length}</strong> keywords and targets,{' '}
                <strong className="tabular-nums">{money(wasted)}</strong> spent with no attributed
                sale
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <Flag kind="warning" label={`ACoS above ${target}`} />
              <div className="mt-1 text-slate-700">
                <strong className="tabular-nums">{overTarget}</strong> keywords and targets above
                the target
              </div>
            </div>
          </div>
          <DataTable<TargetRow>
            title="Keywords and targets"
            rows={shown}
            rowKey={(r) => targetKey(r.campaign_id, r.target_id)}
            csvName="keywords-and-targets.csv"
            initialSort={{ id: 'cost', desc: true }}
            toolbar={
              <label className="flex items-center gap-1.5 text-xs text-slate-700">
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
                  cell: (r) => pct(r.acos),
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
      <span className="font-medium text-[#9e2a2a]">
        <span aria-hidden="true">▲ </span>
        {pct(acos)}
        <span className="sr-only"> (above target)</span>
      </span>
    )
  }
  return <>{pct(acos)}</>
}
