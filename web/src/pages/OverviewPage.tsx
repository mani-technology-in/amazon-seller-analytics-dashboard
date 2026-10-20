import { useMemo } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useFilters } from '../app/filters'
import { useMoney } from '../app/money'
import { useDatasets, useDatasetsAfter } from '../app/useDatasets'
import { DataTable, type Column } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { KpiTile } from '../components/KpiTile'
import { ErrorBox, Loading, PageTitle } from '../components/Layout'
import { NoSales } from '../components/NoSales'
import { SmallMultiples } from '../components/SmallMultiples'
import { Sparkline } from '../components/Sparkline'
import { TrendChart } from '../components/TrendChart'
import type { Manifest } from '../data/types'
import { count, dateShort } from '../lib/format'
import { rangeLength } from '../metrics/dates'
import { MARKETPLACE_NAMES } from '../metrics/marketplace'
import { productRows, topBy } from '../metrics/metrics'
import {
  daysOf,
  overviewTotals,
  revenueAndSpend,
  stockCover,
  unitsByMarketplace,
} from '../metrics/sales'

interface TopRow {
  asin: string
  title: string
  orders: number
  revenue: number
  cover: number | null
}

const cover = (v: number | null) => (v === null ? '–' : `${Math.round(v)} days`)

export function OverviewPage() {
  const manifest = useOutletContext<Manifest>()
  const { filters, update } = useFilters(manifest.dataStart, manifest.dataEnd)
  const m = useMoney()
  // The tiles and charts come from one small file, so they show first; stock cover and the
  // top products need every marketplace's product sales and follow (LCP, NFR).
  const fast = useDatasets('overviewDaily')
  const slow = useDatasetsAfter(
    fast.status !== 'loading',
    'salesDaily',
    'stockSalesDaily',
    'inventoryDaily',
    'products',
  )

  const view = useMemo(() => {
    if (fast.status !== 'ready') return null
    const o = fast.data.overviewDaily
    const { range, previous } = filters
    const daily = new Map(daysOf(range).map((day) => [day, 0]))
    for (let i = 0; i < o.date.length; i++) {
      const day = o.date[i]
      if (daily.has(day)) daily.set(day, daily.get(day)! + o.sales[i])
    }
    return {
      totals: overviewTotals(o, range),
      prev: previous ? overviewTotals(o, previous) : null,
      spark: [...daily.values()],
      weekly: rangeLength(range) > 60,
      chart: revenueAndSpend(o, range),
      units: unitsByMarketplace(o, range),
    }
  }, [fast, filters])

  const stockView = useMemo(() => {
    if (slow.status !== 'ready') return null
    const d = slow.data
    const { range, previous } = filters
    const stock = stockCover(d.inventoryDaily, d.stockSalesDaily, range.end)
    const prevStock = previous
      ? stockCover(d.inventoryDaily, d.stockSalesDaily, previous.end)
      : null
    // productRows needs ads only for its ad columns, which this table does not show
    const noAds = {
      date: [],
      marketplace: [],
      asin: [],
      impressions: [],
      clicks: [],
      cost: [],
      orders: [],
      sales: [],
    }
    const top: TopRow[] = topBy(
      productRows(d.salesDaily, noAds, d.products, range),
      (r) => r.sales,
    ).map((r) => ({
      asin: r.asin,
      title: r.title,
      orders: r.orders,
      revenue: r.sales,
      cover: stock.byAsin.get(r.asin)?.daysOfCover ?? null,
    }))
    return {
      cover: stock.total.daysOfCover,
      prevCover: prevStock ? prevStock.total.daysOfCover : null,
      top,
    }
  }, [slow, filters])

  const data = fast.status === 'error' ? fast : slow
  if (data.status === 'error')
    return <ErrorBox error={data.error} title="Overview" what="sales data" />

  const t = view?.totals
  const p = view?.prev
  const prev = (v: number | null | undefined) => (filters.compare ? (p ? v : null) : undefined)
  const days = rangeLength(filters.range)

  return (
    <>
      <PageTitle title="Overview">
        Is the business on track: sales, orders, units and stock.
      </PageTitle>
      <FilterBar
        filters={filters}
        update={update}
        dataStart={manifest.dataStart}
        dataEnd={manifest.dataEnd}
      />
      {!view || !t ? (
        <Loading />
      ) : (
        <>
          <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile
              label="Revenue"
              value={m.moneyCompact(t.revenue)}
              current={t.revenue}
              previous={prev(p?.revenue)}
              better="up"
              aside={<Sparkline values={view.spark} />}
            />
            <KpiTile
              label="Orders"
              value={count(t.orders)}
              current={t.orders}
              previous={prev(p?.orders)}
              better="up"
            />
            <KpiTile
              label="Units sold"
              value={count(t.units)}
              current={t.units}
              previous={prev(p?.units)}
              better="up"
            />
            <KpiTile
              label="Days of cover"
              value={
                !stockView
                  ? null
                  : stockView.cover === null
                    ? '–'
                    : count(Math.round(stockView.cover))
              }
              current={stockView?.cover ?? null}
              previous={stockView ? prev(stockView.prevCover) : undefined}
              better="neutral"
              hint="Stock available on the last day ÷ average units sold per day over the 30 days to it"
            />
          </section>

          {t.orders === 0 && t.revenue === 0 ? (
            <NoSales range={filters.range} update={update} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <TrendChart
                  title={
                    view.weekly ? 'Revenue against ad spend, weekly' : 'Revenue against ad spend'
                  }
                  dates={view.chart.map((b) => b.start)}
                  series={[
                    { name: 'Revenue', values: view.chart.map((b) => b.revenue) },
                    { name: 'Ad spend', values: view.chart.map((b) => b.adSpend) },
                  ]}
                  format={m.money}
                />
                <SmallMultiples
                  title="Units by marketplace"
                  caption={`Weekly · ${days} days`}
                  kind="bars"
                  items={view.units.map((s) => ({
                    key: s.marketplace,
                    label: s.marketplace,
                    total: count(s.total),
                    values: s.values,
                    alt: `${MARKETPLACE_NAMES[s.marketplace]} units per week: ${s.buckets
                      .map((b, i) => `${dateShort(b.start)} ${count(s.values[i])}`)
                      .join(', ')}`,
                  }))}
                  note={`Each chart has its own scale; the figure is the ${days}-day total. Bars are whole weeks; the last is the latest.`}
                />
              </div>

              {!stockView ? (
                <Loading what="top products" />
              ) : (
                <DataTable<TopRow>
                  title="Top 5 products by revenue"
                  rows={stockView.top}
                  rowKey={(r) => r.asin}
                  csvName="top-products.csv"
                  initialSort={{ id: 'revenue', desc: true }}
                  columns={
                    [
                      {
                        id: 'title',
                        header: 'Product',
                        value: (r) => r.title,
                        cell: (r) => (
                          <Link
                            className="text-accent-strong hover:underline"
                            to={{ pathname: `/sales/${r.asin}`, search: location.search }}
                          >
                            {r.title.replace('Demo Brand ', '')}
                          </Link>
                        ),
                      },
                      {
                        id: 'orders',
                        header: 'Orders',
                        value: (r) => r.orders,
                        cell: (r) => count(r.orders),
                        align: 'right',
                      },
                      {
                        id: 'revenue',
                        header: `Revenue (${m.currency})`,
                        value: (r) => r.revenue,
                        cell: (r) => m.money(r.revenue),
                        align: 'right',
                      },
                      {
                        id: 'cover',
                        header: 'Cover',
                        value: (r) => r.cover,
                        cell: (r) => cover(r.cover),
                        align: 'right',
                        hint: 'Days of stock left at the recent rate of sales, across the chosen fulfilment networks',
                      },
                    ] satisfies Column<TopRow>[]
                  }
                />
              )}
            </>
          )}
        </>
      )}
    </>
  )
}
