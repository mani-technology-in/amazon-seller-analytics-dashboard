import { useMemo, useState, type ReactNode } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useFilters } from '../app/filters'
import { useDatasets } from '../app/useDatasets'
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
  const data = useDatasets('inventoryDaily', 'stockSalesDaily', 'products', 'marketplaces')
  // the product and network the stock chart shows; until picked, the lowest cover
  const [picked, setPicked] = useState<{ asin: string; network: NetworkCode } | null>(null)
  const asOf = filters.range.end

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

  if (data.status === 'error') return <ErrorBox error={data.error} />

  const rows = view?.rows ?? []
  const lowest = [...rows].sort(
    (a, b) =>
      (a.outOfStock ? -1 : (a.daysOfCover ?? Infinity)) -
      (b.outOfStock ? -1 : (b.daysOfCover ?? Infinity)),
  )[0]
  const chosen =
    (picked && rows.find((r) => r.asin === picked.asin && r.network === picked.network)) ||
    (picked && rows.find((r) => r.asin === picked.asin)) ||
    lowest
  const chart =
    data.status === 'ready' && chosen
      ? stockSeries(data.data.inventoryDaily, chosen.asin, chosen.network, filters.range)
      : null
  const productOptions = [...new Map(rows.map((r) => [r.asin, r.title])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  )
  const networkOptions = rows.filter((r) => r.asin === chosen?.asin).map((r) => r.network)

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
      {!view ? (
        <Loading />
      ) : (
        <>
          <section
            aria-label="Key figures"
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
          >
            <KpiTile
              label="Available units"
              value={count(view.available)}
              current={view.available}
              previous={undefined}
              better="neutral"
              aside={
                <Note>
                  In {view.networks} fulfilment network{view.networks === 1 ? '' : 's'}
                </Note>
              }
            />
            <KpiTile
              label="Inbound units"
              value={count(view.inbound)}
              current={view.inbound}
              previous={undefined}
              better="neutral"
              aside={<Note>On the way to Amazon</Note>}
            />
            <KpiTile
              label="Days of cover"
              value={
                view.cover.daysOfCover === null ? '–' : count(Math.round(view.cover.daysOfCover))
              }
              current={view.cover.daysOfCover}
              previous={undefined}
              better="neutral"
              hint="All stock ÷ average units sold per day over the last 30 days"
              aside={<Note>At {count(Math.round(view.cover.avgDailyUnits))} units a day</Note>}
            />
            <KpiTile
              label="Products low on stock"
              value={count(view.low)}
              current={view.low}
              previous={undefined}
              better="neutral"
              aside={<Note>Under {filters.lowStockDays} days of cover</Note>}
            />
            <KpiTile
              label="Products out of stock"
              value={count(view.out)}
              current={view.out}
              previous={undefined}
              better="neutral"
              aside={<Note>In at least one network</Note>}
            />
          </section>

          {chosen && chart ? (
            <section aria-label="Stock over time" className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-caption font-medium text-ink-2">
                  Product
                  <select
                    className={control}
                    value={chosen.asin}
                    onChange={(e) =>
                      setPicked({
                        asin: e.target.value,
                        network: picked?.network ?? chosen.network,
                      })
                    }
                  >
                    {productOptions.map(([asin, title]) => (
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
                    value={chosen.network}
                    onChange={(e) =>
                      setPicked({ asin: chosen.asin, network: e.target.value as NetworkCode })
                    }
                  >
                    {networkOptions.map((n) => (
                      <option key={n} value={n}>
                        {NETWORK_NAMES[n]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <TrendChart
                title={`Stock over time: ${chosen.title.replace('Demo Brand ', '')}, ${NETWORK_NAMES[chosen.network]}`}
                note={
                  chart.outOfStock.length
                    ? `Out of stock on ${chart.outOfStock.reduce((a, b) => a + daysBetween(b.start, b.end), 0)} days in this range`
                    : 'In stock every day of this range'
                }
                dates={chart.dates}
                series={[{ name: 'Available units', values: chart.available }]}
                format={count}
                reference={
                  chosen.avgDailyUnits > 0
                    ? {
                        value: chosen.avgDailyUnits * filters.lowStockDays,
                        label: `Low-stock line, ${filters.lowStockDays} days`,
                      }
                    : undefined
                }
                bands={chart.outOfStock}
                bandLabel="Out of stock"
              />
            </section>
          ) : null}

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
