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
import type {
  AdsCampaignDaily,
  AdsProductDaily,
  AdsTargetDaily,
  Campaign,
  InventoryDaily,
  Product,
  SalesDaily,
  Target,
} from '../data/types'
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

const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(DATA_DIR, name), 'utf-8'))

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
  }[]
  inventory: { asOf: string; rows: Record<string, Record<string, Num | boolean>> }
}

describe.skipIf(!available)('metrics match SQL on the real data', () => {
  const fx: Fixture = available ? JSON.parse(readFileSync(FIXTURE, 'utf-8')) : null!
  const data = available
    ? {
        sales: read<SalesDaily>('sales_daily.json'),
        adsCampaign: read<AdsCampaignDaily>('ads_campaign_daily.json'),
        adsProduct: read<AdsProductDaily>('ads_product_daily.json'),
        adsTarget: read<AdsTargetDaily>('ads_target_daily.json'),
        inventory: read<InventoryDaily>('inventory_daily.json'),
        products: read<Product[]>('products.json'),
        campaigns: read<Campaign[]>('campaigns.json'),
        targets: read<Target[]>('targets.json'),
      }
    : null!

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
})
