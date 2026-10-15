/**
 * Currency conversion (FR-18): local amount x the fixed monthly USD rate for the month of the
 * event. Conversion happens here and nowhere else in the app (and once in SQL for the parity
 * check), so the two can never drift.
 */
import type { CurrencyCode, FxMonthly, ISODate, Marketplace, MarketplaceCode } from '../data/types'

export type DisplayCurrency = 'usd' | 'local'

export class FxRates {
  private readonly rates = new Map<string, number>()
  private readonly currencies = new Map<MarketplaceCode, CurrencyCode>()

  constructor(fx: FxMonthly, marketplaces: Marketplace[]) {
    for (let i = 0; i < fx.year_month.length; i++) {
      this.rates.set(`${fx.currency[i]} ${fx.year_month[i]}`, fx.usd_rate[i])
    }
    for (const m of marketplaces) this.currencies.set(m.marketplace, m.currency)
  }

  currencyOf(marketplace: MarketplaceCode): CurrencyCode {
    const c = this.currencies.get(marketplace)
    if (!c) throw new Error(`Unknown marketplace ${marketplace}`)
    return c
  }

  /** USD per unit of `currency` in the month of `date`. A missing rate is an error. */
  usdRate(currency: CurrencyCode, date: ISODate): number {
    if (currency === 'USD') return 1
    const month = date.slice(0, 7)
    const r = this.rates.get(`${currency} ${month}`)
    if (r === undefined) throw new Error(`No ${currency} rate for ${month}`)
    return r
  }
}

/** A copy of the file with the `money` columns converted to USD, row by row. */
export function toUsd<
  T extends { date: readonly ISODate[]; marketplace: readonly MarketplaceCode[] },
>(file: T, money: (keyof T)[], rates: FxRates): T {
  const factor = file.date.map((d, i) => rates.usdRate(rates.currencyOf(file.marketplace[i]), d))
  const out = { ...file }
  for (const k of money) {
    const col = file[k] as unknown as number[]
    ;(out[k] as unknown as number[]) = col.map((v, i) => v * factor[i])
  }
  return out
}

/** Local currency only makes sense for one marketplace: adding pesos to pounds means nothing. */
export function canShowLocal(codes: Set<MarketplaceCode>): boolean {
  return codes.size === 1
}
