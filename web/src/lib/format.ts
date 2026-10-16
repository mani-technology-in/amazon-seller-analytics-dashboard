/** Display formatting. Every missing value (a ratio over zero) shows as an en dash. */

export const DASH = '–'

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const dec1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export interface MoneyFormat {
  /** ISO code, e.g. "USD" */
  currency: string
  /** $1,235 */
  money(v: number | null): string
  /** $1,234.50 */
  moneyCents(v: number | null): string
  /** $3.25M, $412K, $950 */
  moneyCompact(v: number | null): string
}

const formats = new Map<string, MoneyFormat>()

/** Formatters for one currency; every amount carries its symbol (FR-18): $, CA$, MX$, £, €. */
export function moneyFormat(currency: string): MoneyFormat {
  let f = formats.get(currency)
  if (f) return f
  const whole = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
  const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency })
  const symbol = whole.formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency
  f = {
    currency,
    money: (v) => (v === null ? DASH : whole.format(v)),
    moneyCents: (v) => (v === null ? DASH : cents.format(v)),
    moneyCompact: (v) => {
      if (v === null) return DASH
      const a = Math.abs(v)
      const sign = v < 0 ? '-' : ''
      if (a >= 1e6) return `${sign}${symbol}${(a / 1e6).toFixed(2)}M`
      if (a >= 1e4) return `${sign}${symbol}${Math.round(a / 1e3)}K`
      return whole.format(v)
    },
  }
  formats.set(currency, f)
  return f
}

const usd = moneyFormat('USD')
export const money = usd.money
export const moneyCents = usd.moneyCents
export const moneyCompact = usd.moneyCompact

export function count(v: number | null): string {
  return v === null ? DASH : int.format(v)
}

export function decimal1(v: number | null): string {
  return v === null ? DASH : dec1.format(v)
}

/** 0.1234 -> "12.3%" */
export function pct(v: number | null, digits = 1): string {
  return v === null ? DASH : `${(v * 100).toFixed(digits)}%`
}

/** ROAS as a multiple: 3.31 -> "3.31×" */
export function multiple(v: number | null): string {
  return v === null ? DASH : `${v.toFixed(2)}×`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09-30" -> "30 Sep 2026" */
export function dateLong(iso: string): string {
  return `${dateShort(iso)} ${iso.slice(0, 4)}`
}

/** "2026-09-30" -> "30 Sep" */
export function dateShort(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`
}
