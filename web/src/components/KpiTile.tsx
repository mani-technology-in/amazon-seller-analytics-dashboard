import { percentChange } from '../metrics/dates'
import { pct } from '../lib/format'

type Direction = 'up' | 'down' | 'neutral'

interface KpiTileProps {
  label: string
  value: string
  current: number | null
  previous: number | null | undefined
  /** which way is good; neutral for spend, where more is not better or worse by itself */
  better: Direction
  hint?: string
  /** show the change in percentage points (for ratios like ACoS) instead of percent */
  points?: boolean
}

/** A KPI with its change against the previous period of equal length (FR-2, FR-5). */
export function KpiTile({ label, value, current, previous, better, hint, points }: KpiTileProps) {
  const raw =
    previous === undefined
      ? undefined
      : points
        ? current === null || previous === null
          ? null
          : current - previous
        : percentChange(current, previous)
  // a change that rounds to 0.0 is shown as no change
  const change = raw === undefined || raw === null ? raw : Math.abs(raw) < 0.0005 ? 0 : raw
  const shown =
    change === undefined || change === null
      ? ''
      : points
        ? `${(change * 100).toFixed(1)} pts`
        : pct(change)
  let tone = 'text-slate-600'
  if (change !== undefined && change !== null && change !== 0 && better !== 'neutral') {
    const good = change > 0 === (better === 'up')
    tone = good ? 'text-[#0a7f0a]' : 'text-[#b52f2f]'
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3" title={hint}>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      {change === undefined ? null : (
        <div className={`mt-1 text-xs tabular-nums ${tone}`}>
          {change === null ? (
            <span className="text-slate-500">No comparison</span>
          ) : (
            <>
              <span aria-hidden="true">{change > 0 ? '▲' : change < 0 ? '▼' : '■'}</span>{' '}
              {change > 0 ? '+' : ''}
              {shown} <span className="text-slate-500">vs previous</span>
              <span className="hidden text-slate-500 sm:inline"> period</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
