import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useFilters } from '../app/filters'
import { useMoney } from '../app/money'
import { useDatasets, useDatasetsAfter } from '../app/useDatasets'
import { DataTable, type Column } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { Flag } from '../components/Flag'
import { KpiTile } from '../components/KpiTile'
import { ErrorBox, Loading, PageTitle } from '../components/Layout'
import { ProfitWaterfall } from '../components/ProfitWaterfall'
import type { Manifest } from '../data/types'
import { count, pct, type MoneyFormat } from '../lib/format'
import { rangeLength } from '../metrics/dates'
import { MARKETPLACE_NAMES } from '../metrics/marketplace'
import {
  accountProfitFromSummary,
  marketplaceProfitRows,
  productProfitRows,
  profitTotals,
  profitWaterfall,
  type MarketplaceProfitRow,
  type ProductProfitRow,
  type ProfitLine,
} from '../metrics/profit'

/** FR-31: wherever product cost shows, it says where it comes from. */
const COST_NOTE = 'Entered by the seller, not from Amazon'
const SB_NOTE =
  'Sponsored Products and Sponsored Display: Amazon reports Sponsored Brands spend per campaign, so it counts in the account total above but not per product.'

/** The same profit columns for products and marketplaces (FR-29, FR-30). */
function profitColumns<T extends ProfitLine>(m: MoneyFormat): Column<T>[] {
  const money = (id: keyof ProfitLine, header: string, hint?: string): Column<T> => ({
    id,
    header: `${header}`,
    value: (r) => r[id] as number,
    cell: (r) => m.money(r[id] as number),
    align: 'right',
    hint,
  })
  const signed = (v: number | null, text: string) =>
    v !== null && v < 0 ? <span className="text-critical">{text}</span> : text
  return [
    {
      id: 'units',
      header: 'Units',
      value: (r) => r.units,
      cell: (r) => count(r.units),
      align: 'right',
    },
    money('revenue', `Revenue (${m.currency})`),
    money('refunds', 'Refunds'),
    money('referralFees', 'Referral fees', "Amazon's commission, less what it returns on refunds"),
    money('fbaFees', 'FBA fees', 'Fulfilment by Amazon fee per unit shipped'),
    money('adSpend', 'Ad spend', SB_NOTE),
    money('productCost', 'Product cost', COST_NOTE),
    {
      id: 'netProfit',
      header: 'Net profit',
      value: (r) => r.netProfit,
      cell: (r) => signed(r.netProfit, m.money(r.netProfit)),
      align: 'right',
    },
    {
      id: 'netMargin',
      header: 'Net margin',
      value: (r) => r.netMargin,
      cell: (r) => signed(r.netMargin, pct(r.netMargin)),
      align: 'right',
    },
    {
      id: 'perUnit',
      header: 'Per unit',
      value: (r) => r.profitPerUnit,
      cell: (r) =>
        signed(r.profitPerUnit, r.profitPerUnit === null ? '–' : m.moneyCents(r.profitPerUnit)),
      align: 'right',
      hint: 'Net profit ÷ units',
    },
  ]
}

export function ProfitPage() {
  const manifest = useOutletContext<Manifest>()
  const { filters, update } = useFilters(manifest.dataStart, manifest.dataEnd)
  const m = useMoney()
  // Tiles and the chart come from two small pre-totalled files and show first; the tables need
  // every product's finances and follow.
  const fast = useDatasets('profitSummaryDaily', 'overviewDaily')
  const slow = useDatasetsAfter(
    fast.status !== 'loading',
    'profitDaily',
    'adsProductDaily',
    'products',
  )

  const view = useMemo(() => {
    if (fast.status !== 'ready') return null
    const { profitSummaryDaily: p, overviewDaily: o } = fast.data
    const { range, previous } = filters
    const account = accountProfitFromSummary(p, o, range)
    return {
      account,
      prev: previous ? accountProfitFromSummary(p, o, previous) : null,
      steps: account.revenue > 0 ? profitWaterfall(account) : [],
    }
  }, [fast, filters])

  const tables = useMemo(() => {
    if (slow.status !== 'ready') return null
    const d = slow.data
    const products = productProfitRows(d.profitDaily, d.adsProductDaily, d.products, filters.range)
    const markets = marketplaceProfitRows(d.profitDaily, d.adsProductDaily, filters.range)
    return {
      products,
      productTotal: profitTotals(products),
      markets,
      marketTotal: profitTotals(markets),
      losers: products.filter((x) => x.losesMoney).length,
    }
  }, [slow, filters.range])

  const data = fast.status === 'error' ? fast : slow

  const productCols = useMemo<Column<ProductProfitRow>[]>(
    () => [
      {
        id: 'title',
        header: 'Product',
        value: (r) => r.title,
        cell: (r) => (
          <span className="flex items-center gap-2">
            {r.title.replace('Demo Brand ', '')}
            {r.losesMoney ? <Flag kind="critical" label="Loses money" /> : null}
          </span>
        ),
      },
      ...profitColumns<ProductProfitRow>(m),
    ],
    [m],
  )
  const marketCols = useMemo<Column<MarketplaceProfitRow>[]>(
    () => [
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
      ...profitColumns<MarketplaceProfitRow>(m),
    ],
    [m],
  )

  if (data.status === 'error')
    return <ErrorBox error={data.error} title="Profit" what="profit data" />

  const a = view?.account
  const p = view?.prev
  const prev = (v: number | null | undefined) => (filters.compare ? (p ? v : null) : undefined)
  const days = rangeLength(filters.range)
  const runKey = `${filters.marketplace}|${filters.currency}|${filters.range.start}|${filters.range.end}`

  return (
    <>
      <PageTitle title="Profit">
        What is left after Amazon and ads: revenue, less refunds, Amazon fees, ad spend and product
        cost.
      </PageTitle>
      <FilterBar
        filters={filters}
        update={update}
        dataStart={manifest.dataStart}
        dataEnd={manifest.dataEnd}
      />
      {!view || !a ? (
        <Loading />
      ) : (
        <>
          <section
            aria-label="Key figures"
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
          >
            <KpiTile
              label="Revenue"
              value={m.moneyCompact(a.revenue)}
              current={a.revenue}
              previous={prev(p?.revenue)}
              better="up"
              hint="Before refunds"
            />
            <KpiTile
              label="Amazon fees"
              value={m.moneyCompact(a.amazonFees)}
              current={a.amazonFees}
              previous={prev(p?.amazonFees)}
              better="neutral"
              hint="Referral and FBA fees"
            />
            <KpiTile
              label="Ad spend"
              value={m.moneyCompact(a.adSpend)}
              current={a.adSpend}
              previous={prev(p?.adSpend)}
              better="neutral"
              hint="All ad types"
            />
            <KpiTile
              label="Product cost"
              value={m.moneyCompact(a.productCost)}
              current={a.productCost}
              previous={prev(p?.productCost)}
              better="neutral"
              hint={COST_NOTE}
              note={COST_NOTE}
            />
            <KpiTile
              label="Net profit"
              value={m.moneyCompact(a.netProfit)}
              current={a.netProfit}
              previous={prev(p?.netProfit)}
              better="up"
            />
            <KpiTile
              label="Net margin"
              value={pct(a.netMargin)}
              current={a.netMargin}
              previous={prev(p?.netMargin)}
              better="up"
              points
              hint="Net profit ÷ revenue"
            />
          </section>

          <section
            aria-labelledby="wf-h"
            className="rounded-lg border border-surface-sunken bg-surface-page px-[18px] pt-4 pb-3.5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 id="wf-h" className="text-section-title text-ink">
                  From revenue to net profit
                </h2>
                <p className="mt-0.5 text-small text-ink-3">
                  {a.revenue <= 0
                    ? null
                    : a.netProfit >= 0
                      ? `Of every ${m.money(100)} of revenue, ${m.moneyCents((a.netProfit / a.revenue) * 100)} is left as profit.`
                      : `This range made a loss of ${m.moneyCents((-a.netProfit / a.revenue) * 100)} on every ${m.money(100)} of revenue.`}
                </p>
              </div>
              <span className="font-mono text-chart-label text-ink-3 uppercase">
                {m.currency} · {days} days
              </span>
            </div>
            {view.steps.length ? (
              <div className="mt-5">
                <ProfitWaterfall
                  steps={view.steps}
                  format={m.moneyCompact}
                  formatFull={m.money}
                  runKey={runKey}
                />
              </div>
            ) : (
              <p className="mt-4 text-small text-ink-3">No sales, so no profit to show.</p>
            )}
            <p className="mt-2 text-caption text-ink-3">
              Product cost is entered by the seller, not taken from Amazon. Storage fees, inbound
              shipping and VAT are not included.
            </p>
          </section>

          {!tables ? (
            <Loading what="profit tables" />
          ) : (
            <>
              <DataTable<ProductProfitRow>
                title="Profit by product"
                description={
                  tables.losers
                    ? `${tables.losers} product${tables.losers === 1 ? ' loses' : 's lose'} money in this range. Product cost is entered by the seller, not from Amazon. Ad spend here leaves out Sponsored Brands.`
                    : 'Product cost is entered by the seller, not from Amazon. Ad spend here leaves out Sponsored Brands, which Amazon reports per campaign.'
                }
                rows={tables.products}
                rowKey={(r) => r.asin}
                csvName="product-profit.csv"
                initialSort={{ id: 'netProfit', desc: true }}
                columns={productCols}
                footer={tables.productTotal as ProductProfitRow}
                emptyText="No sales, so no profit to show."
              />

              <DataTable<MarketplaceProfitRow>
                title="Profit by marketplace"
                description="Ads run in the US, the UK and Germany only, so their margins are lower. Product cost is entered by the seller, not from Amazon. Ad spend here leaves out Sponsored Brands."
                rows={tables.markets}
                rowKey={(r) => r.marketplace}
                csvName="marketplace-profit.csv"
                initialSort={{ id: 'revenue', desc: true }}
                columns={marketCols}
                footer={tables.marketTotal as MarketplaceProfitRow}
                emptyText="No sales, so no profit to show."
              />
            </>
          )}
        </>
      )}
    </>
  )
}
