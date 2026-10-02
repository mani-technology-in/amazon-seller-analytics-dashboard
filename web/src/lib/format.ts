/** Display formatting. Every missing value (a ratio over zero) shows as an en dash. */

export const DASH = '–'

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const dec1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function money(v: number | null): string {
  return v === null ? DASH : usd0.format(v)
}

export function moneyCents(v: number | null): string {
  return v === null ? DASH : usd2.format(v)
}

/** $3.25M, $412K, $950 */
export function moneyCompact(v: number | null): string {
  if (v === null) return DASH
  const a = Math.abs(v)
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `$${Math.round(v / 1e3)}K`
  return usd0.format(v)
}

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
