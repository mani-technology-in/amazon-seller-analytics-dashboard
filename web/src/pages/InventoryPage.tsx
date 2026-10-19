import { useMemo, useState, type ReactNode } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useFilters } from '../app/filters'
import { useDatasets, useDatasetsAfter } from '../app/useDatasets'
import { DataTable, type Column } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { Flag } from '../components/Flag'
import { KpiTile } from '../components/KpiTile'
import { ErrorBox, Loading, PageTitle } from '../components/Layout'
import { TrendChart } from '../components/TrendChart'
import type { Manifest, NetworkCode } from '../data/types'
import { count, dateLong, decimal1 } from '../lib/format'
import { inventoryRows, type InventoryRow } from '../metrics/metrics'
import { stockCover, stockSeries } from '../metrics/sales'

const NETWORK_NAMES: Record<NetworkCode, string> = {
  US: 'US network',
  CA: 'Canada network',
  MX: 'Mexico network',
  UK: 'UK network',
  EU: 'EU network (DE, FR)',
}

function status(r: InventoryRow): 0 | 1 | 2 {
  return r.outOfStock ? 0 : r.lowStock ? 1 : 2
}

const control =
  'h-9 max-w-full rounded-md border border-line-strong bg-surface-page px-3 text-small text-ink focus-visible:outline-2 focus-visible:outline-accent-strong'

export function InventoryPage() {
  const manifest = useOutletContext<Manifest>()
  const { filters, update } = useFilters(manifest.dataStart, manifest.dataEnd)
  const asOf = filters.range.end
  // Stock totals come from one small file and show first; cover, flags, the chart and the
  // table need every product's stock and sales and follow.
  const fast = useDatasets('inventorySummaryDaily')
  const data = useDatasetsAfter(
    fast.status !== 'loading',
    'inventoryDaily',
    'stockSalesDaily',
    'products',
    'marketplaces',
  )

  const totals = useMemo(() => {
    if (fast.status !== 'ready') return null
    const t = fast.data.inventorySummaryDaily
    let available = 0
    let inbound = 0
    const networks = new Set<string>()
    for (let i = 0; i < t.date.length; i++) {
      if (t.date[i] !== asOf) continue
      available += t.available[i]
      inbound += t.inbound[i]
      networks.add(t.network[i])
    }
    return { available, inbound, networks: networks.size }
  }, [fast, asOf])
  // the product and network the stock chart shows; until picked, the lowest cover
  const [picked, setPicked] = useState<{ asin: string; network: NetworkCode } | null>(null)

  const view = useMemo(() => {
    if (data.status !== 'ready') return null
    const d = data.data
    const rows = inventoryRows(
      d.inventoryDaily,
      d.stockSalesDaily,
      d.products,
      asOf,
      filters.lowStockDays,
      new Map(d.marketplaces.map((m) => [m.marketplace, m.network])),
    )
    // products, not product-network rows: one product short in two networks counts once
    const products = (keep: (r: InventoryRow) => boolean) =>
      new Set(rows.filter(keep).map((r) => r.asin)).size
    const cover = stockCover(d.inventoryDaily, d.stockSalesDaily, asOf).total
    return {
      rows,
      available: rows.reduce((a, r) => a + r.available, 0),
      inbound: rows.reduce((a, r) => a + r.inbound, 0),
      networks: new Set(rows.map((r) => r.network)).size,
      cover,
      low: products((r) => r.lowStock),
      out: products((r) => r.outOfStock),
    }
  }, [data, asOf, filters.lowStockDays])

  const stock = useMemo(() => {
    if (!view || data.status !== 'ready') return null
    const { rows } = view
    const coverOf = (r: InventoryRow) => (r.outOfStock ? -1 : (r.daysOfCover ?? Infinity))
    const lowest = rows.reduce<InventoryRow | undefined>(
      (a, r) => (!a || coverOf(r) < coverOf(a) ? r : a),
      undefined,
    )
    const chosen =
      (picked && rows.find((r) => r.asin === picked.asin && r.network === picked.network)) ||
      (picked && rows.find((r) => r.asin === picked.asin)) ||
      lowest
    if (!chosen) return null
    const series = stockSeries(data.data.inventoryDaily, chosen.asin, chosen.network, filters.range)
    const outDays = series.outOfStock.reduce((a, b) => a + daysBetween(b.start, b.end), 0)
    return {
      chosen,
      dates: series.dates,
      series: [{ name: 'Available units', values: series.available }],
      bands: series.outOfStock,
      note: outDays
        ? `Out of stock on ${outDays} day${outDays === 1 ? '' : 's'} in this range`
        : 'In stock every day of this range',
      reference:
        chosen.avgDailyUnits > 0
          ? {
              value: chosen.avgDailyUnits * filters.lowStockDays,
              label: `Low-stock line, ${filters.lowStockDays} days`,
            }
          : undefined,
      products: [...new Map(rows.map((r) => [r.asin, r.title])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
      networks: rows.filter((r) => r.asin === chosen.asin).map((r) => r.network),
    }
  }, [view, data, picked, filters.range, filters.lowStockDays])

  if (fast.status === 'error') return <ErrorBox error={fast.error} />
  if (data.status === 'error') return <ErrorBox error={data.error} />

  return (
    <>
      <PageTitle title="Inventory">
        What runs out next: FBA stock on {dateLong(asOf)}, the last day of the range. Germany and
        France share the EU network.
      </PageTitle>
      <FilterBar
        filters={filters}
        update={update}
        dataStart={manifest.dataStart}
        dataEnd={manifest.dataEnd}
        showCompare={false}
        showLowStock
      />
      {!totals ? (
        <Loading />
      ) : (
        <>
          <section
            aria-label="Key figures"
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
          >
            <KpiTile
              label="Available units"
              value={count(totals.available)}
              current={totals.available}
              previous={undefined}
              better="neutral"
              aside={
                <Note>
                  In {totals.networks} fulfilment network{totals.networks === 1 ? '' : 's'}
                </Note>
              }
            />
            <KpiTile
              label="Inbound units"
              value={count(totals.inbound)}
              current={totals.inbound}
              previous={undefined}
              better="neutral"
              aside={<Note>On the way to Amazon</Note>}
            />
            <KpiTile
              label="Days of cover"
              value={
                !view
                  ? null
                  : view.cover.daysOfCover === null
                    ? '–'
                    : count(Math.round(view.cover.daysOfCover))
              }
              current={view?.cover.daysOfCover ?? null}
              previous={undefined}
              better="neutral"
              hint="All stock ÷ average units sold per day over the last 30 days"
              aside={
                view ? (
                  <Note>At {count(Math.round(view.cover.avgDailyUnits))} units a day</Note>
                ) : undefined
              }
            />
            <KpiTile
              label="Products low on stock"
              value={view ? count(view.low) : null}
              current={view?.low ?? null}
              previous={undefined}
              better="neutral"
              aside={<Note>Under {filters.lowStockDays} days of cover</Note>}
            />
            <KpiTile
              label="Products out of stock"
              value={view ? count(view.out) : null}
              current={view?.out ?? null}
              previous={undefined}
              better="neutral"
              aside={<Note>In at least one network</Note>}
            />
          </section>

          {stock ? (
            <section aria-label="Stock over time" className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-caption font-medium text-ink-2">
                  Product
                  <select
                    className={control}
                    value={stock.chosen.asin}
                    onChange={(e) =>
                      setPicked({
                        asin: e.target.value,
                        network: picked?.network ?? stock.chosen.network,
                      })
                    }
                  >
                    {stock.products.map(([asin, title]) => (
                      <option key={asin} value={asin}>
                        {title.replace('Demo Brand ', '')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-caption font-medium text-ink-2">
                  Network
                  <select
                    className={control}
                    value={stock.chosen.network}
                    onChange={(e) =>
                      setPicked({ asin: stock.chosen.asin, network: e.target.value as NetworkCode })
                    }
                  >
                    {stock.networks.map((n) => (
                      <option key={n} value={n}>
                        {NETWORK_NAMES[n]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <TrendChart
                title={`Stock over time: ${stock.chosen.title.replace('Demo Brand ', '')}, ${NETWORK_NAMES[stock.chosen.network]}`}
                note={stock.note}
                dates={stock.dates}
                series={stock.series}
                format={count}
                reference={stock.reference}
                bands={stock.bands}
                bandLabel="Out of stock"
              />
            </section>
          ) : null}

          {!view ? (
            <Loading what="stock by product" />
          ) : (
            <DataTable<InventoryRow>
              title="Stock by product and network"
              rows={view.rows}
              rowKey={(r) => `${r.network} ${r.asin}`}
              csvName="inventory.csv"
              initialSort={{ id: 'cover', desc: false }}
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
                    id: 'network',
                    header: 'Network',
                    value: (r) => r.network,
                    hint: 'Fulfilment network: Germany and France share the EU stock',
                  },
                  {
                    id: 'available',
                    header: 'Available',
                    value: (r) => r.available,
                    cell: (r) => count(r.available),
                    align: 'right',
                  },
                  {
                    id: 'inbound',
                    header: 'Inbound',
                    value: (r) => r.inbound,
                    cell: (r) => count(r.inbound),
                    align: 'right',
                    hint: 'Units in shipments to Amazon: working, shipped and receiving',
                  },
                  {
                    id: 'avg',
                    header: 'Avg daily units',
                    value: (r) => r.avgDailyUnits,
                    cell: (r) => decimal1(r.avgDailyUnits),
                    align: 'right',
                    hint: 'Units sold in the 30 days to the stock date ÷ 30, in the marketplaces this network serves',
                  },
                  {
                    id: 'cover',
                    header: 'Days of cover',
                    value: (r) => (r.outOfStock ? 0 : r.daysOfCover),
                    cell: (r) =>
                      r.daysOfCover === null ? (
                        <span className="text-ink-3">no recent sales</span>
                      ) : (
                        `${Math.round(r.daysOfCover)} days`
                      ),
                    align: 'right',
                  },
                  {
                    id: 'status',
                    header: 'Status',
                    value: (r) => ['Out of stock', 'Low stock', 'In stock'][status(r)],
                    cell: (r) =>
                      r.outOfStock ? (
                        <Flag kind="critical" label="Out of stock" />
                      ) : r.lowStock ? (
                        <Flag kind="warning" label="Low stock" />
                      ) : (
                        <Flag kind="good" label="In stock" />
                      ),
                  },
                ] satisfies Column<InventoryRow>[]
              }
            />
          )}
        </>
      )}
    </>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <span className="text-caption text-ink-3">{children}</span>
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
}
