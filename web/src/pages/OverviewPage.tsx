import { useMemo } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useDatasets } from '../app/useDatasets'
import { useFilters } from '../app/filters'
import { DataTable, type Column } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { KpiTile } from '../components/KpiTile'
import { ErrorBox, Loading, PageTitle } from '../components/Layout'
import { TrendChart } from '../components/TrendChart'
import type { Manifest } from '../data/types'
import { count, money, moneyCompact, multiple, pct } from '../lib/format'
import {
  accountKpis,
  campaignRows,
  dailySeries,
  productRows,
  topBy,
  type CampaignRow,
  type ProductRow,
} from '../metrics/metrics'

export function OverviewPage() {
  const manifest = useOutletContext<Manifest>()
  const { filters, update } = useFilters(manifest.dataStart, manifest.dataEnd)
  const data = useDatasets(
    'salesDaily',
    'adsCampaignDaily',
    'adsProductDaily',
    'products',
    'campaigns',
  )

  const view = useMemo(() => {
    if (data.status !== 'ready') return null
    const d = data.data
    const kpis = accountKpis(d.salesDaily, d.adsCampaignDaily, filters.range)
    const prev = filters.previous
      ? accountKpis(d.salesDaily, d.adsCampaignDaily, filters.previous)
      : null
    const series = dailySeries(d.salesDaily, d.adsCampaignDaily, filters.range)
    return {
      kpis,
      prev,
      dates: series.map((p) => p.date),
      money: [
        { name: 'Total sales', values: series.map((p) => p.sales) },
        { name: 'Ad spend', values: series.map((p) => p.adSpend) },
      ],
      ratios: [
        { name: 'ACoS', values: series.map((p) => p.acos) },
        { name: 'TACoS', values: series.map((p) => p.tacos) },
      ],
      topProducts: topBy(
        productRows(d.salesDaily, d.adsProductDaily, d.products, filters.range),
        (r) => r.sales,
      ),
      topCampaigns: topBy(
        campaignRows(d.adsCampaignDaily, d.campaigns, filters.range),
        (r) => r.cost,
      ),
    }
  }, [data, filters.range, filters.previous])

  if (data.status === 'error') return <ErrorBox error={data.error} />

  const k = view?.kpis
  const p = view?.prev
  const prev = (v: number | null | undefined) => (filters.compare ? (p ? v : null) : undefined)

  return (
    <>
      <PageTitle title="Overview">
        Sales and advertising across all products and ad types.
      </PageTitle>
      <FilterBar
        filters={filters}
        update={update}
        dataStart={manifest.dataStart}
        dataEnd={manifest.dataEnd}
      />
      {!view || !k ? (
        <Loading />
      ) : (
        <>
          <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile
              label="Total sales"
              value={moneyCompact(k.sales)}
              current={k.sales}
              previous={prev(p?.sales)}
              better="up"
            />
            <KpiTile
              label="Orders"
              value={count(k.orders)}
              current={k.orders}
              previous={prev(p?.orders)}
              better="up"
            />
            <KpiTile
              label="Units"
              value={count(k.units)}
              current={k.units}
              previous={prev(p?.units)}
              better="up"
            />
            <KpiTile
              label="Ad spend"
              value={moneyCompact(k.adSpend)}
              current={k.adSpend}
              previous={prev(p?.adSpend)}
              better="neutral"
            />
            <KpiTile
              label="Ad sales"
              value={moneyCompact(k.adSales)}
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
              hint="Ad spend ÷ total sales"
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

          <div className="grid gap-4 lg:grid-cols-2">
            <TrendChart
              title="Total sales and ad spend per day"
              dates={view.dates}
              series={view.money}
              format={money}
            />
            <TrendChart
              title="ACoS and TACoS per day"
              dates={view.dates}
              series={view.ratios}
              format={(v) => pct(v, 0)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DataTable<ProductRow>
              title="Top 5 products by sales"
              rows={view.topProducts}
              rowKey={(r) => r.asin}
              csvName="top-products.csv"
              initialSort={{ id: 'sales', desc: true }}
              columns={
                [
                  {
                    id: 'title',
                    header: 'Product',
                    value: (r) => r.title,
                    cell: (r) => (
                      <Link className="text-[#1c5cab] hover:underline" to={`/products/${r.asin}`}>
                        {r.title.replace('Demo Brand ', '')}
                      </Link>
                    ),
                  },
                  {
                    id: 'sales',
                    header: 'Sales',
                    value: (r) => r.sales,
                    cell: (r) => money(r.sales),
                    align: 'right',
                  },
                  {
                    id: 'units',
                    header: 'Units',
                    value: (r) => r.units,
                    cell: (r) => count(r.units),
                    align: 'right',
                  },
                  {
                    id: 'tacos',
                    header: 'TACoS',
                    value: (r) => r.tacos,
                    cell: (r) => pct(r.tacos),
                    align: 'right',
                  },
                ] satisfies Column<ProductRow>[]
              }
            />
            <DataTable<CampaignRow>
              title="Top 5 campaigns by spend"
              rows={view.topCampaigns}
              rowKey={(r) => r.campaign_id}
              csvName="top-campaigns.csv"
              initialSort={{ id: 'cost', desc: true }}
              columns={
                [
                  { id: 'name', header: 'Campaign', value: (r) => r.campaign_name },
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
                ] satisfies Column<CampaignRow>[]
              }
            />
          </div>
        </>
      )}
    </>
  )
}
