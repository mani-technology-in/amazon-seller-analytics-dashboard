import { useCallback, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useFilters } from '../app/filters'
import { useMoney } from '../app/money'
import { useDatasets } from '../app/useDatasets'
import { FilterBar } from '../components/FilterBar'
import { ErrorBox, Loading, PageTitle } from '../components/Layout'
import { Toast, type ToastMessage } from '../components/Toast'
import type { Manifest } from '../data/types'
import { downloadCsv, toCsv } from '../lib/csv'
import { count, dateLong } from '../lib/format'
import { campaignRows, inventoryRows } from '../metrics/metrics'
import { productProfitRows } from '../metrics/profit'
import {
  campaignColumns,
  inventoryColumns,
  productProfitColumns,
  salesByMarketplaceDay,
  salesDayColumns,
} from '../metrics/reports'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const FX_CURRENCIES = ['CAD', 'MXN', 'GBP', 'EUR'] as const

interface Report {
  id: string
  title: string
  description: string
  rows: number
  build: () => string
}

export function ReportsPage() {
  const manifest = useOutletContext<Manifest>()
  const { filters, update } = useFilters(manifest.dataStart, manifest.dataEnd)
  const m = useMoney()
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  const data = useDatasets(
    'salesDaily',
    'profitDaily',
    'adsProductDaily',
    'adsCampaignDaily',
    'campaigns',
    'products',
    'inventoryDaily',
    'stockSalesDaily',
    'marketplaces',
    'fxMonthly',
  )

  const view = useMemo(() => {
    if (data.status !== 'ready') return null
    const d = data.data
    const { range } = filters
    const cur = m.currency
    const sales = salesByMarketplaceDay(d.salesDaily, range)
    const profit = productProfitRows(d.profitDaily, d.adsProductDaily, d.products, range).sort(
      (a, b) => b.netProfit - a.netProfit,
    )
    const stock = inventoryRows(
      d.inventoryDaily,
      d.stockSalesDaily,
      d.products,
      range.end,
      filters.lowStockDays,
      new Map(d.marketplaces.map((x) => [x.marketplace, x.network])),
    ).sort((a, b) => a.network.localeCompare(b.network) || a.title.localeCompare(b.title))
    const campaigns = campaignRows(d.adsCampaignDaily, d.campaigns, range).sort(
      (a, b) => b.cost - a.cost,
    )
    const reports: Report[] = [
      {
        id: 'sales-by-marketplace-by-day',
        title: 'Sales by marketplace by day',
        description: 'Revenue, orders, units and sessions for each marketplace on each day.',
        rows: sales.length,
        build: () => toCsv(sales, salesDayColumns(cur)),
      },
      {
        id: 'product-profit',
        title: 'Product profit',
        description:
          'Revenue, refunds, Amazon fees, ad spend, product cost (entered by the seller, not from Amazon) and net profit for each product.',
        rows: profit.length,
        build: () => toCsv(profit, productProfitColumns(cur)),
      },
      {
        id: 'inventory-by-network',
        title: 'Inventory by network',
        description: `Available and inbound units, daily sales and days of cover for each product in each fulfilment network, on ${dateLong(range.end)}.`,
        rows: stock.length,
        build: () => toCsv(stock, inventoryColumns),
      },
      {
        id: 'campaign-performance',
        title: 'Campaign performance',
        description:
          'Spend, sales, ACoS, ROAS, clicks and orders for each campaign in each marketplace.',
        rows: campaigns.length,
        build: () => toCsv(campaigns, campaignColumns(cur)),
      },
    ]
    // exchange rates for the months in the range, newest first
    const months = new Set<string>()
    for (let d0 = range.start.slice(0, 7); d0 <= range.end.slice(0, 7);) {
      months.add(d0)
      const [y, mo] = d0.split('-').map(Number)
      d0 = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
    }
    const rates = new Map<string, number>()
    for (let i = 0; i < d.fxMonthly.year_month.length; i++) {
      rates.set(`${d.fxMonthly.year_month[i]} ${d.fxMonthly.currency[i]}`, d.fxMonthly.usd_rate[i])
    }
    const fx = [...months].reverse().map((ym) => ({
      ym,
      label: `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`,
      rates: FX_CURRENCIES.map((c) => rates.get(`${ym} ${c}`) ?? null),
    }))
    return { reports, fx }
  }, [data, filters, m.currency])

  if (data.status === 'error') return <ErrorBox error={data.error} />

  const suffix = `${filters.marketplace === 'all' ? 'all' : filters.marketplace.toLowerCase()}-${filters.range.start}-to-${filters.range.end}`

  return (
    <>
      <PageTitle title="Reports">
        Each report uses the filters below and opens in Excel or Google Sheets. The numbers match
        what the dashboard shows.
      </PageTitle>
      <FilterBar
        filters={filters}
        update={update}
        dataStart={manifest.dataStart}
        dataEnd={manifest.dataEnd}
        showCompare={false}
      />
      {!view ? (
        <Loading />
      ) : (
        <>
          <ul className="overflow-hidden rounded-lg border border-surface-sunken bg-surface-page">
            {view.reports.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-7 gap-y-2 border-t border-surface-sunken px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,1fr)_auto_auto] md:px-5"
              >
                <div>
                  <h2 className="text-section-title text-ink">{r.title}</h2>
                  <p className="mt-1 max-w-[620px] text-small text-ink-2">{r.description}</p>
                </div>
                <span className="font-mono text-table-number whitespace-nowrap text-ink-2 tabular-nums">
                  {count(r.rows)} rows
                </span>
                <button
                  type="button"
                  disabled={!r.rows}
                  title={r.rows ? undefined : 'No rows for these filters'}
                  onClick={() => {
                    downloadCsv(`${r.id}-${suffix}.csv`, r.build())
                    setToast({
                      id: Date.now(),
                      text: `${r.title} downloaded, ${count(r.rows)} rows.`,
                    })
                  }}
                  className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent-strong px-3.5 text-body font-semibold text-surface-page transition-transform duration-(--duration-press) ease-out hover:bg-accent-strong-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-disabled md:col-span-1"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M7 2v7m0 0 3-3M7 9 4 6M2.5 11.5h9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {r.rows ? 'Download CSV' : 'No rows for these filters'}
                </button>
              </li>
            ))}
          </ul>

          <section
            aria-labelledby="fx-h"
            className="overflow-x-auto rounded-lg border border-surface-sunken bg-surface-page"
          >
            <div className="px-4 py-3">
              <h2 id="fx-h" className="text-section-title text-ink">
                Exchange rates used
              </h2>
              <p className="mt-0.5 text-small text-ink-3">
                US dollars per unit of each currency. Amounts are turned into US dollars at the rate
                for the month they happened. These rates are part of the synthetic data.
              </p>
            </div>
            <table className="w-full min-w-max text-left text-body">
              <thead className="bg-surface-side text-caption text-ink-3">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Month
                  </th>
                  {FX_CURRENCIES.map((c) => (
                    <th key={c} scope="col" className="px-4 py-2.5 text-right font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.fx.map((row) => (
                  <tr key={row.ym} className="border-t border-surface-sunken">
                    <td className="px-4 py-2.5">{row.label}</td>
                    {row.rates.map((v, i) => (
                      <td
                        key={FX_CURRENCIES[i]}
                        className="px-4 py-2.5 text-right font-mono text-table-number text-ink-2 tabular-nums"
                      >
                        {v === null ? '–' : v.toFixed(4)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      <Toast message={toast} onClose={closeToast} />
    </>
  )
}
