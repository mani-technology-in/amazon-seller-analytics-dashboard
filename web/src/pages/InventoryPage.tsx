import { useMemo } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useDatasets } from '../app/useDatasets'
import { useFilters } from '../app/filters'
import { DataTable, type Column } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { Flag } from '../components/Flag'
import { ErrorBox, Loading, PageTitle } from '../components/Layout'
import type { Manifest } from '../data/types'
import { count, dateLong, decimal1 } from '../lib/format'
import { inventoryRows, type InventoryRow } from '../metrics/metrics'

function status(r: InventoryRow): 0 | 1 | 2 {
  return r.outOfStock ? 0 : r.lowStock ? 1 : 2
}

export function InventoryPage() {
  const manifest = useOutletContext<Manifest>()
  const { filters, update } = useFilters(manifest.dataStart, manifest.dataEnd)
  const data = useDatasets('inventoryDaily', 'salesDaily', 'products')

  const rows = useMemo(
    () =>
      data.status === 'ready'
        ? inventoryRows(
            data.data.inventoryDaily,
            data.data.salesDaily,
            data.data.products,
            manifest.dataEnd,
            filters.lowStockDays,
          )
        : null,
    [data, manifest.dataEnd, filters.lowStockDays],
  )

  if (data.status === 'error') return <ErrorBox error={data.error} />

  const out = rows?.filter((r) => r.outOfStock).length ?? 0
  const low = rows?.filter((r) => r.lowStock).length ?? 0

  return (
    <>
      <PageTitle title="Inventory">
        FBA stock on {dateLong(manifest.dataEnd)}, the last day of data. Days of cover = available
        units ÷ average daily units sold over the last 30 days.
      </PageTitle>
      <FilterBar
        filters={filters}
        update={update}
        dataStart={manifest.dataStart}
        dataEnd={manifest.dataEnd}
        showDates={false}
        showLowStock
      />
      {!rows ? (
        <Loading />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-sm" aria-label="Stock flags">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <Flag kind="critical" label="Out of stock" />
              <div className="mt-1 tabular-nums text-slate-700">
                <strong>{out}</strong> products
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <Flag kind="warning" label={`Under ${filters.lowStockDays} days of cover`} />
              <div className="mt-1 tabular-nums text-slate-700">
                <strong>{low}</strong> products
              </div>
            </div>
          </div>
          <DataTable<InventoryRow>
            title="FBA inventory"
            rows={rows}
            rowKey={(r) => r.asin}
            csvName="inventory.csv"
            initialSort={{ id: 'cover', desc: false }}
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
                { id: 'category', header: 'Category', value: (r) => r.category },
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
                  hint: 'Units sold in the last 30 days ÷ 30',
                },
                {
                  id: 'cover',
                  header: 'Days of cover',
                  value: (r) => (r.outOfStock ? 0 : r.daysOfCover),
                  cell: (r) =>
                    r.daysOfCover === null ? (
                      <span className="text-slate-500">no recent sales</span>
                    ) : (
                      decimal1(r.daysOfCover)
                    ),
                  align: 'right',
                },
                {
                  id: 'status',
                  header: 'Status',
                  value: (r) => ['Out of stock', 'Low stock', 'OK'][status(r)],
                  cell: (r) =>
                    r.outOfStock ? (
                      <Flag kind="critical" label="Out of stock" />
                    ) : r.lowStock ? (
                      <Flag kind="warning" label="Low stock" />
                    ) : (
                      <Flag kind="good" label="OK" />
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
