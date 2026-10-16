/**
 * The data as the pages see it: the chosen marketplaces' files joined into one per dataset,
 * with money in the display currency (FR-17, FR-18). Pages call these zero-argument methods
 * and never deal with marketplaces or currencies themselves.
 */
import { FxRates, toUsd, type DisplayCurrency } from '../metrics/currency'
import type { DataSource } from './dataSource'
import type {
  AdsCampaignDaily,
  AdsProductDaily,
  AdsTargetDaily,
  Campaign,
  FxMonthly,
  InventoryDaily,
  Manifest,
  Marketplace,
  MarketplaceCode,
  OverviewDaily,
  Product,
  ProfitDaily,
  SalesDaily,
  Target,
} from './types'

export interface Datasets {
  manifest(): Promise<Manifest>
  products(): Promise<Product[]>
  marketplaces(): Promise<Marketplace[]>
  fxMonthly(): Promise<FxMonthly>
  campaigns(): Promise<Campaign[]>
  targets(): Promise<Target[]>
  overviewDaily(): Promise<OverviewDaily>
  salesDaily(): Promise<SalesDaily>
  adsCampaignDaily(): Promise<AdsCampaignDaily>
  adsProductDaily(): Promise<AdsProductDaily>
  adsTargetDaily(): Promise<AdsTargetDaily>
  profitDaily(): Promise<ProfitDaily>
  inventoryDaily(): Promise<InventoryDaily>
  /**
   * Sales of every marketplace served by the chosen fulfilment networks: Germany's stock is
   * also France's, so days of cover needs both. Money is NOT converted; use it for units only.
   */
  stockSalesDaily(): Promise<SalesDaily>
}

export interface Selection {
  marketplaces: MarketplaceCode[]
  /** 'local' is only valid for a single marketplace (metrics/currency.ts canShowLocal) */
  currency: DisplayCurrency
}

/** Several column files of the same shape, one after another. */
export function concatColumns<T extends object>(files: T[]): T {
  if (!files.length) throw new Error('No files to join')
  if (files.length === 1) return files[0]
  const keys = Object.keys(files[0]).sort().join(',')
  for (const f of files) {
    if (Object.keys(f).sort().join(',') !== keys) throw new Error('Files have different columns')
  }
  return Object.fromEntries(
    Object.keys(files[0]).map((k) => [k, files.flatMap((f) => f[k as keyof T] as unknown[])]),
  ) as T
}

export function selectData(source: DataSource, selection: Selection): Datasets {
  const codes = selection.marketplaces
  if (!codes.length) throw new Error('Choose at least one marketplace')
  const wanted = new Set(codes)
  const memo = new Map<string, Promise<unknown>>()
  const once =
    <T>(name: string, get: () => Promise<T>) =>
    (): Promise<T> => {
      let p = memo.get(name)
      if (!p) {
        p = get()
        p.catch(() => memo.delete(name))
        memo.set(name, p)
      }
      return p as Promise<T>
    }
  const rates = once(
    'rates',
    async () => new FxRates(await source.fxMonthly(), await source.marketplaces()),
  )
  const inCurrency = async <
    T extends { date: readonly string[]; marketplace: readonly MarketplaceCode[] },
  >(
    file: T,
    money: Parameters<typeof toUsd<T>>[1],
  ): Promise<T> => {
    if (selection.currency === 'local') {
      if (codes.length !== 1) throw new Error('Local currency needs exactly one marketplace')
      return file
    }
    return toUsd(file, money, await rates())
  }
  const each = <T extends object>(get: (m: MarketplaceCode) => Promise<T>): Promise<T> =>
    Promise.all(codes.map(get)).then((files) => concatColumns<T>(files))

  return {
    manifest: () => source.manifest(),
    products: () => source.products(),
    marketplaces: () => source.marketplaces(),
    fxMonthly: () => source.fxMonthly(),
    campaigns: once('campaigns', async () =>
      (await source.campaigns()).filter((c) => wanted.has(c.marketplace)),
    ),
    targets: once('targets', async () =>
      (await source.targets()).filter((t) => wanted.has(t.marketplace)),
    ),
    overviewDaily: once('overviewDaily', async () => {
      const all = await source.overviewDaily()
      const keep = all.marketplace.map((m) => wanted.has(m))
      const filtered = Object.fromEntries(
        Object.entries(all).map(([k, col]) => [k, (col as unknown[]).filter((_, i) => keep[i])]),
      ) as unknown as OverviewDaily
      return inCurrency(filtered, ['sales', 'ad_spend', 'ad_sales'])
    }),
    salesDaily: once('salesDaily', async () =>
      inCurrency(await each<SalesDaily>((m) => source.salesDaily(m)), ['sales']),
    ),
    adsCampaignDaily: once('adsCampaignDaily', async () =>
      inCurrency(await each<AdsCampaignDaily>((m) => source.adsCampaignDaily(m)), [
        'cost',
        'sales',
      ]),
    ),
    adsProductDaily: once('adsProductDaily', async () =>
      inCurrency(await each<AdsProductDaily>((m) => source.adsProductDaily(m)), ['cost', 'sales']),
    ),
    adsTargetDaily: once('adsTargetDaily', async () =>
      inCurrency(await each<AdsTargetDaily>((m) => source.adsTargetDaily(m)), ['cost', 'sales']),
    ),
    profitDaily: once('profitDaily', async () =>
      inCurrency(await each<ProfitDaily>((m) => source.profitDaily(m)), [
        'principal',
        'refunds',
        'referral_fees',
        'fba_fees',
        'product_cost',
      ]),
    ),
    inventoryDaily: once('inventoryDaily', async () => {
      const networks = [
        ...new Set(
          (await source.marketplaces())
            .filter((m) => wanted.has(m.marketplace))
            .map((m) => m.network),
        ),
      ]
      return concatColumns(await Promise.all(networks.map((n) => source.inventoryDaily(n))))
    }),
    stockSalesDaily: once('stockSalesDaily', async () => {
      const markets = await source.marketplaces()
      const networks = new Set(
        markets.filter((m) => wanted.has(m.marketplace)).map((m) => m.network),
      )
      const served = markets.filter((m) => networks.has(m.network)).map((m) => m.marketplace)
      return concatColumns(await Promise.all(served.map((m) => source.salesDaily(m))))
    }),
  }
}
