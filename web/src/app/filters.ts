import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AdProduct, ISODate } from '../data/types'
import {
  clampRange,
  DEFAULT_PRESET,
  presetRange,
  previousPeriod,
  type DateRange,
  type PresetId,
} from '../metrics/dates'
import { DEFAULT_LOW_STOCK_DAYS, DEFAULT_TARGET_ACOS } from '../metrics/metrics'

/**
 * Page filters live in the URL, so any view can be bookmarked or shared (FR-1, FR-9).
 *
 *   ?preset=last7|last30|last90|mtd|custom  &from=YYYY-MM-DD&to=YYYY-MM-DD (custom)
 *   &compare=off                            hide the previous-period comparison
 *   &ad=SP,SD                               ad types (Advertising page)
 *   &campaign=<id>                          one campaign (Advertising page)
 *   &acos=30                                target ACoS in percent
 *   &lowstock=21                            low-stock threshold in days of cover
 */
export interface Filters {
  preset: PresetId
  range: DateRange
  previous: DateRange | null
  compare: boolean
  adProducts: AdProduct[]
  campaignId: string | null
  targetAcos: number // fraction, e.g. 0.3
  lowStockDays: number
}

const AD_PRODUCTS: AdProduct[] = ['SP', 'SB', 'SD']
const PRESET_IDS: PresetId[] = ['last7', 'last30', 'last90', 'mtd', 'custom']
const isDate = (s: string | null): s is ISODate => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

function bounded(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

/** Reads filters from URL parameters; anything missing or invalid falls back to its default. */
export function parseFilters(
  params: URLSearchParams,
  dataStart: ISODate,
  dataEnd: ISODate,
): Filters {
  const rawPreset = params.get('preset') as PresetId | null
  let preset: PresetId = rawPreset && PRESET_IDS.includes(rawPreset) ? rawPreset : DEFAULT_PRESET
  const from = params.get('from')
  const to = params.get('to')

  let range: DateRange
  if (preset === 'custom' && isDate(from) && isDate(to)) {
    range = clampRange({ start: from, end: to }, dataStart, dataEnd)
  } else {
    if (preset === 'custom') preset = DEFAULT_PRESET
    range = presetRange(preset as Exclude<PresetId, 'custom'>, dataEnd)
  }

  const compare = params.get('compare') !== 'off'
  const adProducts = (params.get('ad') ?? '')
    .split(',')
    .filter((a): a is AdProduct => AD_PRODUCTS.includes(a as AdProduct))

  return {
    preset,
    range,
    previous: compare ? previousPeriod(range, dataStart) : null,
    compare,
    adProducts,
    campaignId: params.get('campaign') || null,
    targetAcos: bounded(params.get('acos'), DEFAULT_TARGET_ACOS * 100, 1, 200) / 100,
    lowStockDays: bounded(params.get('lowstock'), DEFAULT_LOW_STOCK_DAYS, 1, 365),
  }
}

export type FilterPatch = Partial<
  Record<
    'preset' | 'from' | 'to' | 'compare' | 'ad' | 'campaign' | 'acos' | 'lowstock',
    string | null
  >
>

export function useFilters(dataStart: ISODate, dataEnd: ISODate) {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(
    () => parseFilters(params, dataStart, dataEnd),
    [params, dataStart, dataEnd],
  )
  const update = useCallback(
    (patch: FilterPatch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return { filters, update }
}
