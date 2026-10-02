import { describe, expect, it } from 'vitest'
import { parseFilters } from './filters'

const START = '2025-10-01'
const END = '2026-09-30'
const parse = (q: string) => parseFilters(new URLSearchParams(q), START, END)

describe('filters from the URL (FR-1, FR-9)', () => {
  it('default to the last 30 days with comparison on', () => {
    const f = parse('')
    expect(f.preset).toBe('last30')
    expect(f.range).toEqual({ start: '2026-09-01', end: END })
    expect(f.compare).toBe(true)
    expect(f.previous).toEqual({ start: '2026-08-02', end: '2026-08-31' })
    expect(f.targetAcos).toBe(0.3)
    expect(f.lowStockDays).toBe(21)
  })

  it('read presets, custom ranges and settings', () => {
    expect(parse('preset=last7').range).toEqual({ start: '2026-09-24', end: END })
    const c = parse('preset=custom&from=2025-11-01&to=2025-12-31&compare=off&acos=25&lowstock=14')
    expect(c.range).toEqual({ start: '2025-11-01', end: '2025-12-31' })
    expect(c.previous).toBeNull()
    expect(c.compare).toBe(false)
    expect(c.targetAcos).toBe(0.25)
    expect(c.lowStockDays).toBe(14)
  })

  it('read ad type and campaign filters', () => {
    const f = parse('ad=SB,SD,XX&campaign=123')
    expect(f.adProducts).toEqual(['SB', 'SD'])
    expect(f.campaignId).toBe('123')
  })

  it('fall back to defaults for anything invalid', () => {
    const f = parse('preset=yesterday&acos=-5&lowstock=abc')
    expect(f.preset).toBe('last30')
    expect(f.targetAcos).toBe(0.3)
    expect(f.lowStockDays).toBe(21)
    expect(parse('preset=custom&from=nonsense').preset).toBe('last30')
  })

  it('keep custom ranges inside the data and say so', () => {
    const f = parse('preset=custom&from=2024-01-01&to=2030-01-01')
    expect(f.range).toEqual({ start: START, end: END })
    expect(f.rangeAdjusted).toBe('trimmed')
    expect(parse('preset=custom&from=2025-11-01&to=2025-12-31').rangeAdjusted).toBeNull()
    expect(parse('').rangeAdjusted).toBeNull()
  })

  it('put a reversed custom range in order', () => {
    const f = parse('preset=custom&from=2026-09-30&to=2026-09-01')
    expect(f.range).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(f.rangeAdjusted).toBeNull()
  })

  it('use the default range when a custom range has no data at all (Testing D-3)', () => {
    for (const q of [
      'preset=custom&from=2024-01-01&to=2024-01-31',
      'preset=custom&from=2027-01-01&to=2027-02-01',
    ]) {
      const f = parse(q)
      expect(f.preset).toBe('last30')
      expect(f.range).toEqual({ start: '2026-09-01', end: END })
      expect(f.rangeAdjusted).toBe('outside')
    }
  })
})
