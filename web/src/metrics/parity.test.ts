/**
 * Parity: the TypeScript metrics give the same numbers as SQL over the real exported data.
 *
 * Needs the exported data (web/public/data, from `make data`) and the SQL fixture
 * (`python parity.py`, path in PARITY_FIXTURE). CI runs it in the parity job; locally it is
 * skipped unless both exist.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { StaticJsonDataSource } from '../data/dataSource'
import { selectData } from '../data/selection'
import type { MarketplaceCode } from '../data/types'
import { LOCAL_CURRENCY } from '../app/filters'
import { MARKETPLACE_CODES, marketplaceShares } from './marketplace'
import { accountProfit, marketplaceProfitRows, productProfitRows } from './profit'
import { previousPeriod } from './dates'
import {
  accountKpis,
  campaignRows,
  inventoryRows,
  productRows,
  targetKey,
  targetRows,
} from './metrics'

const DATA_DIR = resolve(__dirname, '../../public/data')
const FIXTURE =
  process.env.PARITY_FIXTURE ?? resolve(__dirname, '../../../pipeline/output/parity.json')
const available = existsSync(FIXTURE) && existsSync(resolve(DATA_DIR, 'manifest.json'))

// In CI (REQUIRE_PARITY=1) a missing fixture or data file is a failure, never a silent skip.
if (process.env.REQUIRE_PARITY === '1' && !available) {
  throw new Error(`Parity inputs missing: fixture ${FIXTURE}, data ${DATA_DIR}`)
}

const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(DATA_DIR, name), 'utf-8'))

/** Answers the data source's requests from the files on disk. */
const diskFetch = async (url: string) => {
  const path = resolve(DATA_DIR, url.split('/data/')[1])
  const ok = existsSync(path)
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => (ok ? read<unknown>(url.split('/data/')[1]) : null),
  }
}

async function loadSelection(marketplaces: MarketplaceCode[]) {
  const d = selectData(new StaticJsonDataSource('/data/', diskFetch), {
    marketplaces,
    currency: 'usd',
  })
  const [sales, adsCampaign, adsProduct, adsTarget, inventory, products, campaigns, targets] =
    await Promise.all([
      d.salesDaily(),
      d.adsCampaignDaily(),
      d.adsProductDaily(),
      d.adsTargetDaily(),
      d.inventoryDaily(),
      d.products(),
      d.campaigns(),
      d.targets(),
    ])
  const [profit, overview] = await Promise.all([d.profitDaily(), d.overviewDaily()])
  return {
    sales,
    adsCampaign,
    adsProduct,
    adsTarget,
    inventory,
    products,
    campaigns,
    targets,
    profit,
    overview,
  }
}

async function loadData() {
  return { data: await loadSelection(['US']), usd: await loadSelection([...MARKETPLACE_CODES]) }
}

type Num = number | null
const MONEY = 0.006 // sums of 2-decimal floats vs exact SQL numeric
const RATIO = 1e-9

function close(actual: Num, expected: Num, tol: number, what: string) {
  if (expected === null) {
    expect(actual, what).toBeNull()
  } else {
    expect(actual, what).not.toBeNull()
    expect(Math.abs((actual as number) - expected), what).toBeLessThanOrEqual(tol)
  }
}

interface Fixture {
  dataStart: string
  dataEnd: string
  targetAcos: number
  lowStockDays: number
  ranges: {
    name: string
    start: string
    end: string
    account: Record<string, Num>
    previous: { start: string; end: string; account: Record<string, Num> } | null
    campaigns: Record<string, Record<string, Num>>
    targets: Record<string, Record<string, Num | boolean>>
    products: Record<string, Record<string, Num>>
    marketplaces: Record<string, Record<string, Num>>
    productProfit: Record<string, Record<string, Num>>
    marketplaceProfit: Record<string, Record<string, Num>>
    accountProfit: Record<string, Num>
  }[]
  inventory: { asOf: string; rows: Record<string, Record<string, Num | boolean>> }
}

// The data is read through the same layer the pages use (data/selection.ts): the v1.0
// metrics on the US marketplace, the CR-1 metrics on every marketplace in USD.
const { data, usd } = available ? await loadData() : { data: null!, usd: null! }

describe.skipIf(!available)('metrics match SQL on the real data', () => {
  const fx: Fixture = available ? JSON.parse(readFileSync(FIXTURE, 'utf-8')) : null!
  const ranges = available ? fx.ranges : []

  it.each(ranges.map((r) => [r.name, r] as const))(
    '%s: account KPIs and previous period',
    (_, r) => {
      const range = { start: r.start, end: r.end }
      const checkAccount = (
        exp: Record<string, Num>,
        k: ReturnType<typeof accountKpis>,
        tag: string,
      ) => {
        close(k.sales, exp.sales, MONEY, `${tag} sales`)
        close(k.adSpend, exp.ad_spend, MONEY, `${tag} ad spend`)
        close(k.adSales, exp.ad_sales, MONEY, `${tag} ad sales`)
        expect(k.orders).toBe(exp.orders)
        expect(k.units).toBe(exp.units)
        expect(k.adOrders).toBe(exp.ad_orders)
        expect(k.impressions).toBe(exp.impressions)
        expect(k.clicks).toBe(exp.clicks)
        close(k.acos, exp.acos, RATIO, `${tag} ACoS`)
        close(k.tacos, exp.tacos, RATIO, `${tag} TACoS`)
        close(k.roas, exp.roas, RATIO, `${tag} ROAS`)
      }
      checkAccount(r.account, accountKpis(data.sales, data.adsCampaign, range), r.name)

      const prev = previousPeriod(range, fx.dataStart)
      if (r.previous === null) {
        expect(prev).toBeNull()
      } else {
        expect(prev).toEqual({ start: r.previous.start, end: r.previous.end })
        checkAccount(
          r.previous.account,
          accountKpis(data.sales, data.adsCampaign, prev!),
          'previous',
        )
      }
    },
  )

  it.each(ranges.map((r) => [r.name, r] as const))('%s: every campaign', (_, r) => {
    const rows = campaignRows(data.adsCampaign, data.campaigns, { start: r.start, end: r.end })
    expect(rows).toHaveLength(Object.keys(r.campaigns).length)
    for (const c of rows) {
      const exp = r.campaigns[c.campaign_id]
      const tag = `${r.name} ${c.campaign_name}`
      expect([c.impressions, c.clicks, c.orders]).toEqual([exp.impressions, exp.clicks, exp.orders])
      close(c.cost, exp.cost, MONEY, `${tag} cost`)
      close(c.sales, exp.sales, MONEY, `${tag} sales`)
      for (const m of ['ctr', 'cpc', 'cvr', 'acos', 'roas'] as const)
        close(c[m], exp[m], RATIO, `${tag} ${m}`)
    }
  })

  it.each(ranges.map((r) => [r.name, r] as const))(
    '%s: every keyword and target, with flags',
    (_, r) => {
      const rows = targetRows(
        data.adsTarget,
        data.targets,
        data.campaigns,
        { start: r.start, end: r.end },
        fx.targetAcos,
      )
      expect(rows).toHaveLength(Object.keys(r.targets).length)
      for (const t of rows) {
        const exp = r.targets[targetKey(t.campaign_id, t.target_id)]
        const tag = `${r.name} ${t.target_text}`
        expect([t.impressions, t.clicks, t.orders]).toEqual([
          exp.impressions,
          exp.clicks,
          exp.orders,
        ])
        close(t.cost, exp.cost as Num, MONEY, `${tag} cost`)
        close(t.acos, exp.acos as Num, RATIO, `${tag} acos`)
        expect(t.noSales, `${tag} no sales`).toBe(exp.no_sales)
        expect(t.acosAboveTarget, `${tag} ACoS above target`).toBe(exp.acos_above_target)
      }
    },
  )

  it.each(ranges.map((r) => [r.name, r] as const))('%s: every product', (_, r) => {
    const rows = productRows(data.sales, data.adsProduct, data.products, {
      start: r.start,
      end: r.end,
    })
    expect(rows).toHaveLength(Object.keys(r.products).length)
    for (const p of rows) {
      const exp = r.products[p.asin]
      const tag = `${r.name} ${p.title}`
      expect([p.units, p.orders, p.sessions]).toEqual([exp.units, exp.orders, exp.sessions])
      close(p.sales, exp.sales, MONEY, `${tag} sales`)
      close(p.adSpend, exp.ad_spend, MONEY, `${tag} ad spend`)
      close(p.unitSessionPct, exp.unit_session_pct, RATIO, `${tag} unit session %`)
      close(p.tacos, exp.tacos, RATIO, `${tag} TACoS`)
    }
  })

  it('inventory on the last day, with low-stock and out-of-stock flags', () => {
    const rows = inventoryRows(
      data.inventory,
      data.sales,
      data.products,
      fx.inventory.asOf,
      fx.lowStockDays,
    )
    expect(rows).toHaveLength(Object.keys(fx.inventory.rows).length)
    for (const i of rows) {
      const exp = fx.inventory.rows[i.asin]
      expect([i.available, i.reserved, i.inbound]).toEqual([
        exp.available,
        exp.reserved,
        exp.inbound,
      ])
      close(i.avgDailyUnits, exp.avg_daily_units as Num, RATIO, `${i.title} avg units`)
      close(i.daysOfCover, exp.days_of_cover as Num, 1e-6, `${i.title} days of cover`)
      expect(i.outOfStock, i.title).toBe(exp.out_of_stock)
      expect(i.lowStock, i.title).toBe(exp.low_stock)
    }
    expect(rows.some((r) => r.lowStock)).toBe(true)
  })

  it.each(ranges.map((r) => [r.name, r] as const))(
    '%s: every marketplace, in USD, with its share of revenue',
    (_, r) => {
      const rows = marketplaceShares(usd.sales, { start: r.start, end: r.end })
      expect(rows).toHaveLength(Object.keys(r.marketplaces).length)
      for (const m of rows) {
        const exp = r.marketplaces[m.marketplace]
        const tag = `${r.name} ${m.marketplace}`
        expect([m.orders, m.units]).toEqual([exp.orders, exp.units])
        close(m.revenue, exp.revenue, MONEY, `${tag} revenue`)
        close(m.aov, exp.aov, 1e-6, `${tag} AOV`)
        close(m.share, exp.share, 1e-9, `${tag} share`)
      }
    },
  )

  it.each(ranges.map((r) => [r.name, r] as const))(
    '%s: profit for every product, every marketplace and the account, in USD',
    (_, r) => {
      const range = { start: r.start, end: r.end }
      const rows = productProfitRows(usd.profit, usd.adsProduct, usd.products, range)
      expect(rows).toHaveLength(Object.keys(r.productProfit).length)
      for (const p of rows) {
        const exp = r.productProfit[p.asin]
        const tag = `${r.name} ${p.title}`
        expect(p.units).toBe(exp.units)
        close(p.revenue, exp.revenue, MONEY, `${tag} revenue`)
        close(p.refunds, exp.refunds, MONEY, `${tag} refunds`)
        close(p.referralFees, exp.referral_fees, MONEY, `${tag} referral fees`)
        close(p.fbaFees, exp.fba_fees, MONEY, `${tag} FBA fees`)
        close(p.adSpend, exp.ad_spend, MONEY, `${tag} ad spend`)
        close(p.productCost, exp.product_cost, MONEY, `${tag} product cost`)
        close(p.netProfit, exp.net_profit, MONEY, `${tag} net profit`)
        expect(p.losesMoney, tag).toBe((exp.net_profit as number) < 0)
      }
      const byMarketplace = marketplaceProfitRows(usd.profit, usd.adsProduct, range)
      expect(byMarketplace).toHaveLength(Object.keys(r.marketplaceProfit).length)
      for (const m of byMarketplace) {
        const exp = r.marketplaceProfit[m.marketplace]
        expect(m.units).toBe(exp.units)
        close(m.revenue, exp.revenue, MONEY, `${r.name} ${m.marketplace} revenue`)
        close(m.adSpend, exp.ad_spend, MONEY, `${r.name} ${m.marketplace} ad spend`)
        close(m.netProfit, exp.net_profit, MONEY, `${r.name} ${m.marketplace} net profit`)
      }
      const a = accountProfit(usd.profit, usd.adsCampaign, range)
      const exp = r.accountProfit
      expect(a.units).toBe(exp.units)
      for (const [k, e] of [
        ['revenue', 'revenue'],
        ['refunds', 'refunds'],
        ['referralFees', 'referral_fees'],
        ['fbaFees', 'fba_fees'],
        ['adSpend', 'ad_spend'],
        ['productCost', 'product_cost'],
        ['netProfit', 'net_profit'],
      ] as const)
        close(a[k], exp[e], MONEY, `${r.name} account ${k}`)
    },
  )
  it('the overview file matches the sales and ads files, day by day and marketplace by marketplace', () => {
    const sum = (key: (i: number) => string, n: number, value: (i: number) => number) => {
      const m = new Map<string, number>()
      for (let i = 0; i < n; i++) m.set(key(i), (m.get(key(i)) ?? 0) + value(i))
      return m
    }
    const o = usd.overview
    const at = (i: number) => `${o.date[i]} ${o.marketplace[i]}`
    const s = usd.sales
    const sKey = (i: number) => `${s.date[i]} ${s.marketplace[i]}`
    const c = usd.adsCampaign
    const cKey = (i: number) => `${c.date[i]} ${c.marketplace[i]}`
    const checks: [Map<string, number>, (i: number) => number, number][] = [
      [sum(sKey, s.date.length, (i) => s.sales[i]), (i) => o.sales[i], MONEY],
      [sum(sKey, s.date.length, (i) => s.orders[i]), (i) => o.orders[i], 0],
      [sum(sKey, s.date.length, (i) => s.units[i]), (i) => o.units[i], 0],
      [sum(cKey, c.date.length, (i) => c.cost[i]), (i) => o.ad_spend[i], MONEY],
      [sum(cKey, c.date.length, (i) => c.sales[i]), (i) => o.ad_sales[i], MONEY],
    ]
    expect(o.date.length).toBeGreaterThan(0)
    for (const [expected, actual, tol] of checks) {
      for (let i = 0; i < o.date.length; i++) close(actual(i), expected.get(at(i)) ?? 0, tol, at(i))
      expect(new Set(o.date.map((_, i) => at(i))).size, 'one row per day and marketplace').toBe(
        o.date.length,
      )
    }
    expect(sum(sKey, s.date.length, () => 1).size).toBeLessThanOrEqual(o.date.length)
  })
  it('the app knows the currency of each marketplace, as the data does', () => {
    const markets = read<{ marketplace: MarketplaceCode; currency: string }[]>('marketplaces.json')
    expect(Object.fromEntries(markets.map((m) => [m.marketplace, m.currency]))).toEqual(
      LOCAL_CURRENCY,
    )
  })
})
