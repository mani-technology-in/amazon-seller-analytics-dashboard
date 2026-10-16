import type { ReactNode } from 'react'
import { percentChange } from '../metrics/dates'
import { pct } from '../lib/format'

type Direction = 'up' | 'down' | 'neutral'

interface KpiTileProps {
  label: string
  /** null while its data loads: the tile shows a placeholder bar */
  value: string | null
  current: number | null
  previous: number | null | undefined
  /** which way is good; neutral for spend, where more is not better or worse by itself */
  better: Direction
  hint?: string
  /** show the change in percentage points (for ratios like ACoS) instead of percent */
  points?: boolean
  /** shown at the right of the change line, e.g. a small trend line */
  aside?: ReactNode
  /** a short line under everything, e.g. where a figure comes from */
  note?: string
}

/** A KPI with its change against the previous period of equal length (FR-2, FR-5). */
export function KpiTile({
  label,
  value,
  current,
  previous,
  better,
  hint,
  points,
  aside,
  note,
}: KpiTileProps) {
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
  let tone = 'text-ink-2'
  if (change !== undefined && change !== null && change !== 0 && better !== 'neutral') {
    const good = change > 0 === (better === 'up')
    tone = good ? 'text-accent-strong' : 'text-critical'
  }
  return (
    <div className="rounded-lg bg-surface-page/94 px-4 py-3.5 shadow-tile" title={hint}>
      <div className="text-small text-ink-3">{label}</div>
      {value === null ? (
        <div
          role="status"
          aria-label={`Loading ${label.toLowerCase()}`}
          className="mt-1.5 h-[26px] w-20 animate-pulse rounded-sm bg-skeleton [animation-duration:var(--duration-pulse)]"
        />
      ) : (
        <div className="mt-1.5 w-fit bg-(image:--gradient-brand) bg-clip-text text-kpi-number-phone text-transparent tabular-nums md:text-kpi-number">
          {value}
        </div>
      )}
      {change === undefined && !aside ? null : (
        <div className="mt-2 flex min-h-6 items-center justify-between gap-2">
          {change === undefined ? null : (
            <div className={`text-caption tabular-nums ${tone}`}>
              {change === null ? (
                <span className="text-ink-3">No comparison</span>
              ) : (
                <>
                  <b className="font-semibold">
                    <span aria-hidden="true">{change > 0 ? '▲' : change < 0 ? '▼' : '■'}</span>{' '}
                    {change > 0 ? '+' : ''}
                    {shown}
                  </b>{' '}
                  <span className="text-ink-2">on last period</span>
                </>
              )}
            </div>
          )}
          {aside}
        </div>
      )}
      {note ? <div className="mt-1 text-caption text-ink-3">{note}</div> : null}
    </div>
  )
}
