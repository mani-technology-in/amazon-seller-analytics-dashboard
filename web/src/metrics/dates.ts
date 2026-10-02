import type { ISODate } from '../data/types'

/** An inclusive range of whole days. */
export interface DateRange {
  start: ISODate
  end: ISODate
}

export type PresetId = 'last7' | 'last30' | 'last90' | 'mtd' | 'custom'

export const PRESETS: { id: Exclude<PresetId, 'custom'>; label: string }[] = [
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'mtd', label: 'Month to date' },
]

export const DEFAULT_PRESET: PresetId = 'last30'

const DAY_MS = 86_400_000

function toUtc(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

function fromUtc(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUtc(toUtc(d) + n * DAY_MS)
}

/** Number of days in an inclusive range. */
export function rangeLength(r: DateRange): number {
  return Math.round((toUtc(r.end) - toUtc(r.start)) / DAY_MS) + 1
}

export function inRange(d: ISODate, r: DateRange): boolean {
  return d >= r.start && d <= r.end // ISO dates sort as strings
}

/** Preset ranges end on the last day of data ("today" for the demo). */
export function presetRange(preset: Exclude<PresetId, 'custom'>, dataEnd: ISODate): DateRange {
  switch (preset) {
    case 'last7':
      return { start: addDays(dataEnd, -6), end: dataEnd }
    case 'last30':
      return { start: addDays(dataEnd, -29), end: dataEnd }
    case 'last90':
      return { start: addDays(dataEnd, -89), end: dataEnd }
    case 'mtd':
      return { start: `${dataEnd.slice(0, 8)}01`, end: dataEnd }
  }
}

/** Keeps a custom range inside the data and in the right order. */
export function clampRange(r: DateRange, dataStart: ISODate, dataEnd: ISODate): DateRange {
  let start = r.start < dataStart ? dataStart : r.start > dataEnd ? dataEnd : r.start
  let end = r.end > dataEnd ? dataEnd : r.end < dataStart ? dataStart : r.end
  if (start > end) [start, end] = [end, start]
  return { start, end }
}

/**
 * The period of equal length just before `r` (FR-2). Null when any of it falls before the first
 * day of data, because a comparison against a partial period would mislead.
 */
export function previousPeriod(r: DateRange, dataStart: ISODate): DateRange | null {
  const len = rangeLength(r)
  const prev = { start: addDays(r.start, -len), end: addDays(r.start, -1) }
  return prev.start < dataStart ? null : prev
}

/** Fractional change from `previous` to `current`; null when there is nothing to compare. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return (current - previous) / Math.abs(previous)
}
