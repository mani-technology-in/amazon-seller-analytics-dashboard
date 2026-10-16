import { useId, useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useFilters } from '../app/filters'
import { useMoney } from '../app/money'
import { useDatasets, useDatasetsAfter } from '../app/useDatasets'
import { DataTable, type Column } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { KpiTile } from '../components/KpiTile'
import { ErrorBox, Loading, PageTitle } from '../components/Layout'
import { SmallMultiples } from '../components/SmallMultiples'
import { TrendChart } from '../components/TrendChart'
import type { Manifest, MarketplaceCode } from '../data/types'
import { count, dateLong, pct } from '../lib/format'
import { percentChange, rangeLength } from '../metrics/dates'
import { MARKETPLACE_NAMES, marketplaceShares, type MarketplaceShare } from '../metrics/marketplace'
import { dailySeries, productRows, type ProductRow } from '../metrics/metrics'
import {
  productMarketplaceRevenue,
  revenueByMarketplace,
  salesKpisFromOverview,
} from '../metrics/sales'

const SB_NOTE =
  'Sponsored Products and Sponsored Display only: Amazon reports Sponsored Brands spend per campaign, not per product.'

type Split = { marketplace: MarketplaceCode; revenue: number }[]
type SalesProductRow = ProductRow & { split: Split }
type MarketRow = MarketplaceShare & { change: number | null }

/** A product name that opens its revenue by marketplace underneath (FR-11). */
function ProductName({ row, money }: { row: SalesProductRow; money: (v: number) => string }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const name = row.title.replace('Demo Brand ', '')
  return (
    <div className="min-w-56 whitespace-normal">
      <div className="flex items-center gap-1.5">
        {row.split.length > 1 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`Revenue by marketplace for ${name}`}
            onClick={() => setOpen(!open)}
            className="flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-surface-hover hover:text-ink"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
              className={`transition-transform duration-(--duration-press) ease-out ${open ? 'rotate-90' : ''}`}
            >
              <path
                d="M4.5 3 7.5 6l-3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : row.split.length ? (
          <span className="size-7 shrink-0" />
        ) : null}
        <Link
          className="text-accent-strong hover:underline"
          to={{ pathname: `/sales/${row.asin}`, search: location.search }}
        >
          {name}
        </Link>
      </div>
      {open ? (
        <ul
          id={listId}
          aria-label="Revenue by marketplace"
          className="mt-2 ml-8 flex flex-wrap gap-2"
        >
          {row.split.map((s) => (
            <li
              key={s.marketplace}
              className="flex h-7 items-baseline gap-1.5 rounded-sm bg-surface-page px-2.5 text-caption leading-7 text-ink-2 shadow-raised"
            >
              {s.marketplace} <b className="font-mono font-normal text-ink">{money(s.revenue)}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function SalesPage() {
  const manifest = useOutletContext<Manifest>()
  const { filters, update } = useFilters(manifest.dataStart, manifest.dataEnd)
  const m = useMoney()
  // Tiles, chart and marketplace table come from one small file and show first; the product
  // table needs every marketplace's product sales and follows.
  const fast = useDatasets('overviewDaily')
  const slow = useDatasetsAfter(
    fast.status !== 'loading',
    'salesDaily',
    'adsProductDaily',
    'products',
  )

  const view = useMemo(() => {
    if (fast.status !== 'ready') return null
    const o = fast.data.overviewDaily
    const { range, previous } = filters
    const prevShares = previous
      ? new Map(marketplaceShares(o, previous).map((r) => [r.marketplace, r.revenue]))
      : null
    return {
      kpis: salesKpisFromOverview(o, range),
      prev: previous ? salesKpisFromOverview(o, previous) : null,
      revenue: revenueByMarketplace(o, range),
      markets: marketplaceShares(o, range).map((r) => ({
        ...r,
        change: prevShares ? percentChange(r.revenue, prevShares.get(r.marketplace) ?? 0) : null,
      })),
    }
  }, [fast, filters])

  const products = useMemo(() => {
    if (slow.status !== 'ready') return null
    const d = slow.data
    const split = productMarketplaceRevenue(d.salesDaily, filters.range)
    return productRows(d.salesDaily, d.adsProductDaily, d.products, filters.range).map((r) => ({
      ...r,
      split: filters.marketplace === 'all' ? (split.get(r.asin) ?? []) : [],
    }))
  }, [slow, filters.range, filters.marketplace])

  const data = fast.status === 'error' ? fast : slow
  if (data.status === 'error') return <ErrorBox error={data.error} />

  const k = view?.kpis
  const p = view?.prev
  const prev = (v: number | null | undefined) => (filters.compare ? (p ? v : null) : undefined)
  const cur = m.currency
  const days = rangeLength(filters.range)

  return (
    <>
      <PageTitle title="Sales">Where revenue comes from: by marketplace and by product.</PageTitle>
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
          <section
            aria-label="Key figures"
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
          >
            <KpiTile
              label="Revenue"
              value={m.moneyCompact(k.revenue)}
              current={k.revenue}
              previous={prev(p?.revenue)}
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
              label="Units sold"
              value={count(k.units)}
              current={k.units}
              previous={prev(p?.units)}
              better="up"
            />
            <KpiTile
              label="Average order value"
              value={m.moneyCents(k.aov)}
              current={k.aov}
              previous={prev(p?.aov)}
              better="up"
              hint="Revenue ÷ orders"
            />
            <KpiTile
              label="Sessions"
              value={count(k.sessions)}
              current={k.sessions}
              previous={prev(p?.sessions)}
              better="up"
            />
            <KpiTile
              label="Unit session percentage"
              value={pct(k.unitSessionPct)}
              current={k.unitSessionPct}
              previous={prev(p?.unitSessionPct)}
              better="up"
              points
              hint="Units ordered ÷ sessions"
            />
          </section>

          <SmallMultiples
            title={view.revenue.length > 1 ? 'Revenue by marketplace' : 'Revenue per day'}
            caption={`Daily · ${cur} · ${days} days`}
            kind="line"
            items={view.revenue.map((s) => ({
              key: s.marketplace,
              label: MARKETPLACE_NAMES[s.marketplace],
              total: m.money(s.total),
              values: s.values,
              alt: `${MARKETPLACE_NAMES[s.marketplace]} daily revenue, ${days}-day total ${m.money(s.total)}`,
            }))}
            note={
              view.revenue.length > 1
                ? 'Each chart has its own scale so smaller marketplaces show their shape. France and Mexico opened during the year and are still growing.'
                : undefined
            }
          />

          <DataTable<MarketRow>
            title="Marketplaces"
            rows={view.markets}
            rowKey={(r) => r.marketplace}
            csvName="marketplaces.csv"
            initialSort={{ id: 'revenue', desc: true }}
            columns={
              [
                {
                  id: 'marketplace',
                  header: 'Marketplace',
                  value: (r) => r.marketplace,
                  cell: (r) => (
                    <>
                      <span className="inline-block w-8 font-mono text-caption text-ink-3">
                        {r.marketplace}
                      </span>
                      {MARKETPLACE_NAMES[r.marketplace]}
                    </>
                  ),
                },
                {
                  id: 'revenue',
                  header: `Revenue (${cur})`,
                  value: (r) => r.revenue,
                  cell: (r) => m.money(r.revenue),
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
                  id: 'units',
                  header: 'Units',
                  value: (r) => r.units,
                  cell: (r) => count(r.units),
                  align: 'right',
                },
                {
                  id: 'share',
                  header: 'Share of revenue',
                  value: (r) => r.share,
                  cell: (r) => pct(r.share),
                  align: 'right',
                },
                {
                  id: 'change',
                  header: 'Change',
                  value: (r) => r.change,
                  cell: (r) =>
                    r.change === null
                      ? '–'
                      : `${r.change > 0 ? '▲ +' : r.change < 0 ? '▼ ' : ''}${pct(r.change)}`,
                  align: 'right',
                  hint: 'Revenue against the previous period of the same length',
                },
              ] satisfies Column<MarketRow>[]
            }
          />

          {!products ? (
            <Loading what="products" />
          ) : (
            <DataTable<SalesProductRow>
              title="Products"
              rows={products}
              rowKey={(r) => r.asin}
              csvName="products.csv"
              initialSort={{ id: 'sales', desc: true }}
              columns={
                [
                  {
                    id: 'title',
                    header: 'Product',
                    value: (r) => r.title,
                    cell: (r) => <ProductName row={r} money={m.money} />,
                  },
                  {
                    id: 'units',
                    header: 'Units',
                    value: (r) => r.units,
                    cell: (r) => count(r.units),
                    align: 'right',
                  },
                  {
                    id: 'sales',
                    header: `Revenue (${cur})`,
                    value: (r) => r.sales,
                    cell: (r) => m.money(r.sales),
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
                    header: 'Unit session %',
                    value: (r) => r.unitSessionPct,
                    cell: (r) => pct(r.unitSessionPct),
                    align: 'right',
                    hint: 'Units ordered ÷ sessions',
                  },
                  {
                    id: 'adSpend',
                    header: `Ad spend (${cur})`,
                    value: (r) => r.adSpend,
                    cell: (r) => m.money(r.adSpend),
                    align: 'right',
                    hint: SB_NOTE,
                  },
                  {
                    id: 'tacos',
                    header: 'TACoS',
                    value: (r) => r.tacos,
                    cell: (r) => pct(r.tacos),
                    align: 'right',
                    hint: `Ad spend ÷ revenue. ${SB_NOTE}`,
                  },
                ] satisfies Column<SalesProductRow>[]
              }
            />
          )}
        </>
      )}
    </>
  )
}

export function ProductDetailPage() {
  const manifest = useOutletContext<Manifest>()
  const { asin } = useParams()
  const { filters, update } = useFilters(manifest.dataStart, manifest.dataEnd)
  const m = useMoney()
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
      split: productMarketplaceRevenue(d.salesDaily, filters.range).get(asin) ?? [],
      dates: series.map((p) => p.date),
      money: [
        { name: 'Revenue', values: series.map((p) => p.sales) },
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
        <Link
          className="text-accent-strong underline"
          to={{ pathname: '/sales', search: location.search }}
        >
          Back to sales
        </Link>
      </PageTitle>
    )

  const { product, row } = view
  return (
    <>
      <Link
        className="text-body text-accent-strong hover:underline"
        to={{ pathname: '/sales', search: location.search }}
      >
        ← All products
      </Link>
      <PageTitle title={product.title}>
        {product.category} · ASIN <span className="font-mono">{product.asin}</span> · SKU{' '}
        {product.sku} · list price ${product.price.toFixed(2)} in the US · launched{' '}
        {dateLong(product.launch_date)}
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
          label="Revenue"
          value={m.moneyCompact(row!.sales)}
          current={row!.sales}
          previous={undefined}
          better="up"
        />
        <KpiTile
          label="Units sold"
          value={count(row!.units)}
          current={row!.units}
          previous={undefined}
          better="up"
        />
        <KpiTile
          label="Ad spend"
          value={m.moneyCompact(row!.adSpend)}
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
      {view.split.length > 1 ? (
        <section aria-labelledby="split-h">
          <h2 id="split-h" className="mb-2 text-section-title text-ink">
            Revenue by marketplace
          </h2>
          <ul className="flex flex-wrap gap-2">
            {view.split.map((s) => (
              <li
                key={s.marketplace}
                className="flex h-8 items-baseline gap-1.5 rounded-sm bg-surface-page px-3 text-small leading-8 text-ink-2 shadow-raised"
              >
                {MARKETPLACE_NAMES[s.marketplace]}{' '}
                <b className="font-mono font-normal text-ink">{m.money(s.revenue)}</b>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Revenue and ad spend per day"
          dates={view.dates}
          series={view.money}
          format={m.money}
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
