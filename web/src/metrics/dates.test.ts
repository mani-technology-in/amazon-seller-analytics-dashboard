import { describe, expect, it } from 'vitest'
import {
  addDays,
  clampRange,
  percentChange,
  presetRange,
  previousPeriod,
  rangeLength,
} from './dates'

const END = '2026-09-30'
const START = '2025-10-01'

describe('presets (FR-1)', () => {
  it('end on the last day of data', () => {
    expect(presetRange('last7', END)).toEqual({ start: '2026-09-24', end: END })
    expect(presetRange('last30', END)).toEqual({ start: '2026-09-01', end: END })
    expect(presetRange('last90', END)).toEqual({ start: '2026-07-03', end: END })
    expect(presetRange('mtd', END)).toEqual({ start: '2026-09-01', end: END })
  })

  it('have the stated number of days', () => {
    expect(rangeLength(presetRange('last7', END))).toBe(7)
    expect(rangeLength(presetRange('last30', END))).toBe(30)
    expect(rangeLength(presetRange('last90', END))).toBe(90)
  })

  it('month to date on the 1st is a single day', () => {
    expect(presetRange('mtd', '2026-03-01')).toEqual({ start: '2026-03-01', end: '2026-03-01' })
  })
})

describe('previous period (FR-2)', () => {
  it('is the same length, just before', () => {
    expect(previousPeriod({ start: '2026-09-01', end: END }, START)).toEqual({
      start: '2026-08-02',
      end: '2026-08-31',
    })
  })

  it('handles month and year boundaries', () => {
    expect(previousPeriod({ start: '2026-01-01', end: '2026-01-07' }, START)).toEqual({
      start: '2025-12-25',
      end: '2025-12-31',
    })
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('is null when it would start before the data does', () => {
    expect(previousPeriod({ start: START, end: END }, START)).toBeNull()
    expect(previousPeriod({ start: '2025-10-05', end: '2025-10-10' }, START)).toBeNull()
  })
})

describe('percent change', () => {
  it('is relative to the previous value', () => {
    expect(percentChange(120, 100)).toBeCloseTo(0.2)
    expect(percentChange(80, 100)).toBeCloseTo(-0.2)
  })

  it('is null when there is nothing to compare', () => {
    expect(percentChange(50, 0)).toBeNull()
    expect(percentChange(null, 10)).toBeNull()
    expect(percentChange(10, null)).toBeNull()
  })
})

describe('custom ranges', () => {
  it('are kept inside the data and in order', () => {
    expect(clampRange({ start: '2025-01-01', end: '2027-01-01' }, START, END)).toEqual({
      start: START,
      end: END,
    })
    expect(clampRange({ start: '2026-05-10', end: '2026-05-01' }, START, END)).toEqual({
      start: '2026-05-01',
      end: '2026-05-10',
    })
  })
})
