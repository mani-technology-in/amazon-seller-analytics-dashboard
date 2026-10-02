import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'
import { count, dateLong, dateShort, DASH, money, moneyCompact, multiple, pct } from './format'

describe('formatting', () => {
  it('shows missing values as a dash, never 0', () => {
    expect([money(null), pct(null), multiple(null), count(null)]).toEqual([DASH, DASH, DASH, DASH])
  })

  it('formats money, percentages and multiples', () => {
    expect(money(1234.56)).toBe('$1,235')
    expect(moneyCompact(3_246_001)).toBe('$3.25M')
    expect(moneyCompact(84_123)).toBe('$84K')
    expect(pct(0.30249)).toBe('30.2%')
    expect(multiple(3.3058)).toBe('3.31×')
  })

  it('formats dates the same in every locale', () => {
    expect(dateLong('2026-09-30')).toBe('30 Sep 2026')
    expect(dateShort('2026-01-05')).toBe('5 Jan')
  })
})

describe('CSV export (FR-3)', () => {
  it('quotes commas, quotes and line breaks, and leaves empty values blank', () => {
    const csv = toCsv(
      [
        { a: 'plain', b: 1.5 },
        { a: 'has, comma "and quote"', b: null },
      ],
      [
        { header: 'Name', value: (r) => r.a },
        { header: 'Value', value: (r) => r.b },
      ],
    )
    expect(csv).toBe('Name,Value\r\nplain,1.5\r\n"has, comma ""and quote""",\r\n')
  })
})
