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
}

export interface Selection {
  marketplaces: MarketplaceCode[]
  /** 'local' is only valid for a single marketplace (metrics/currency.ts canShowLocal) */
  currency: DisplayCurrency
}

/** Several column files of the same shape, one after another. */
export function concatColumns<T extends object>(files: T[]): T {
  if (files.length === 1) return files[0]
  const keys = Object.keys(files[0] ?? {}) as (keyof T)[]
  return Object.fromEntries(
    keys.map((k) => [k, files.flatMap((f) => f[k] as unknown as unknown[])]),
  ) as T
}

export function selectData(source: DataSource, selection: Selection): Datasets {
  const codes = selection.marketplaces
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
    Promise.all(codes.map((m) => get(m))).then((files) => concatColumns<T>(files))

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
      inCurrency(await each<SalesDaily>(source.salesDaily), ['sales']),
    ),
    adsCampaignDaily: once('adsCampaignDaily', async () =>
      inCurrency(await each<AdsCampaignDaily>(source.adsCampaignDaily), ['cost', 'sales']),
    ),
    adsProductDaily: once('adsProductDaily', async () =>
      inCurrency(await each<AdsProductDaily>(source.adsProductDaily), ['cost', 'sales']),
    ),
    adsTargetDaily: once('adsTargetDaily', async () =>
      inCurrency(await each<AdsTargetDaily>(source.adsTargetDaily), ['cost', 'sales']),
    ),
    profitDaily: once('profitDaily', async () =>
      inCurrency(await each<ProfitDaily>(source.profitDaily), [
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
      return concatColumns(await Promise.all(networks.map(source.inventoryDaily)))
    }),
  }
}
