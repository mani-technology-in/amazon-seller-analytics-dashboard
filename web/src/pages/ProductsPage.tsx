import { useMemo } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useDatasets } from '../app/useDatasets'
import { useFilters } from '../app/filters'
import { DataTable, type Column } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { KpiTile } from '../components/KpiTile'
import { ErrorBox, Loading, PageTitle } from '../components/Layout'
import { TrendChart } from '../components/TrendChart'
import type { Manifest } from '../data/types'
import { count, dateLong, money, moneyCompact, pct } from '../lib/format'
import { dailySeries, productRows, type ProductRow } from '../metrics/metrics'

const SB_NOTE =
  'Sponsored Products and Sponsored Display only: Amazon reports Sponsored Brands spend per campaign, not per product.'

export function ProductsPage() {
  const manifest = useOutletContext<Manifest>()
  const { filters, update } = useFilters(manifest.dataStart, manifest.dataEnd)
  const data = useDatasets('salesDaily', 'adsProductDaily', 'products')

  const rows = useMemo(
    () =>
      data.status === 'ready'
        ? productRows(
            data.data.salesDaily,
            data.data.adsProductDaily,
            data.data.products,
            filters.range,
          )
        : null,
    [data, filters.range],
  )

  if (data.status === 'error') return <ErrorBox error={data.error} />

  return (
    <>
      <PageTitle title="Products">Sales, traffic and ad spend for each product (ASIN).</PageTitle>
      <FilterBar
        filters={filters}
        update={update}
        dataStart={manifest.dataStart}
        dataEnd={manifest.dataEnd}
        showCompare={false}
      />
      {!rows ? (
        <Loading />
      ) : (
        <DataTable<ProductRow>
          title="Products"
          rows={rows}
          rowKey={(r) => r.asin}
          csvName="products.csv"
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
                id: 'asin',
                header: 'ASIN',
                value: (r) => r.asin,
                cell: (r) => <span className="font-mono text-xs">{r.asin}</span>,
              },
              { id: 'category', header: 'Category', value: (r) => r.category },
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
                id: 'sessions',
                header: 'Sessions',
                value: (r) => r.sessions,
                cell: (r) => count(r.sessions),
                align: 'right',
              },
              {
                id: 'usp',
                header: 'Conv. rate',
                value: (r) => r.unitSessionPct,
                cell: (r) => pct(r.unitSessionPct),
                align: 'right',
                hint: 'Unit session percentage: units ordered ÷ sessions',
              },
              {
                id: 'adSpend',
                header: 'Ad spend',
                value: (r) => r.adSpend,
                cell: (r) => money(r.adSpend),
                align: 'right',
                hint: SB_NOTE,
              },
              {
                id: 'adSales',
                header: 'Ad sales',
                value: (r) => r.adSales,
                cell: (r) => money(r.adSales),
                align: 'right',
                hint: SB_NOTE,
              },
              {
                id: 'tacos',
                header: 'TACoS',
                value: (r) => r.tacos,
                cell: (r) => pct(r.tacos),
                align: 'right',
                hint: `Ad spend ÷ total sales. ${SB_NOTE}`,
              },
            ] satisfies Column<ProductRow>[]
          }
        />
      )}
    </>
  )
}

export function ProductDetailPage() {
  const manifest = useOutletContext<Manifest>()
  const { asin } = useParams()
  const { filters, update } = useFilters(manifest.dataStart, manifest.dataEnd)
  const data = useDatasets('salesDaily', 'adsProductDaily', 'products')

  const view = useMemo(() => {
    if (data.status !== 'ready' || !asin) return null
    const d = data.data
    const product = d.products.find((p) => p.asin === asin)
    if (!product) return { product: null }
    const series = dailySeries(d.salesDaily, d.adsProductDaily, filters.range, asin)
    const [row] = productRows(d.salesDaily, d.adsProductDaily, [product], filters.range)
    return {
      product,
      row,
      dates: series.map((p) => p.date),
      money: [
        { name: 'Sales', values: series.map((p) => p.sales) },
        { name: 'Ad spend', values: series.map((p) => p.adSpend) },
      ],
      units: [{ name: 'Units', values: series.map((p) => p.units) }],
    }
  }, [data, asin, filters.range])

  if (data.status === 'error') return <ErrorBox error={data.error} />
  if (!view) return <Loading />
  if (!view.product)
    return (
      <PageTitle title="Product not found">
        No product with ASIN {asin}.{' '}
        <Link className="text-[#1c5cab] underline" to="/products">
          Back to products
        </Link>
      </PageTitle>
    )

  const { product, row } = view
  return (
    <>
      <Link
        className="text-sm text-[#1c5cab] hover:underline"
        to={{ pathname: '/products', search: location.search }}
      >
        ← All products
      </Link>
      <PageTitle title={product.title}>
        {product.category} · ASIN <span className="font-mono">{product.asin}</span> · SKU{' '}
        {product.sku} · {money(product.price)} · launched {dateLong(product.launch_date)}
      </PageTitle>
      <FilterBar
        filters={filters}
        update={update}
        dataStart={manifest.dataStart}
        dataEnd={manifest.dataEnd}
        showCompare={false}
      />
      <section aria-label="Product figures" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          label="Sales"
          value={moneyCompact(row!.sales)}
          current={row!.sales}
          previous={undefined}
          better="up"
        />
        <KpiTile
          label="Units"
          value={count(row!.units)}
          current={row!.units}
          previous={undefined}
          better="up"
        />
        <KpiTile
          label="Ad spend"
          value={moneyCompact(row!.adSpend)}
          current={row!.adSpend}
          previous={undefined}
          better="neutral"
          hint={SB_NOTE}
        />
        <KpiTile
          label="TACoS"
          value={pct(row!.tacos)}
          current={row!.tacos}
          previous={undefined}
          better="down"
          hint={SB_NOTE}
        />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Sales and ad spend per day"
          dates={view.dates}
          series={view.money}
          format={money}
        />
        <TrendChart
          title="Units ordered per day"
          dates={view.dates}
          series={view.units}
          format={count}
        />
      </div>
    </>
  )
}
