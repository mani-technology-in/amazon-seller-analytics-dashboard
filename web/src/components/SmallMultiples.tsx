import type { ReactNode } from 'react'

export interface Small {
  key: string
  label: ReactNode
  /** the figure beside the label, already formatted */
  total: string
  values: number[]
  /** what a screen reader hears for this chart */
  alt: string
}

interface SmallMultiplesProps {
  title: string
  /** small mono caption at the top right, e.g. "Weekly · 30 days" */
  caption: string
  items: Small[]
  kind: 'bars' | 'line'
  note?: string
}

/**
 * One small chart per marketplace, each on its own scale, so small marketplaces show their
 * shape (UI design: six small charts instead of one with six series).
 */
export function SmallMultiples({ title, caption, items, kind, note }: SmallMultiplesProps) {
  return (
    <section className="rounded-lg border border-surface-sunken bg-surface-page px-[18px] pt-4 pb-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-section-title text-ink">{title}</h2>
        <span className="font-mono text-chart-label text-ink-3 uppercase">{caption}</span>
      </div>
      {items.length ? (
        <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3">
          {items.map((m) => (
            <div key={m.key} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 text-small font-semibold">
                <span>{m.label}</span>
                <span className="font-mono text-caption font-normal text-ink-2 tabular-nums">
                  {m.total}
                </span>
              </div>
              {kind === 'bars' ? (
                <Bars values={m.values} alt={m.alt} />
              ) : (
                <Line values={m.values} alt={m.alt} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3.5 text-small text-ink-3">No data for these filters.</p>
      )}
      {note ? <p className="mt-3 text-caption text-ink-3">{note}</p> : null}
    </section>
  )
}

function Bars({ values, alt }: { values: number[]; alt: string }) {
  const max = Math.max(...values, 0) || 1
  return (
    <div role="img" aria-label={alt} className="mt-2 flex h-16 items-end gap-[5px]">
      {values.map((v, i) => (
        <i
          key={i}
          className={`flex-1 rounded-t-[3px] ${i === values.length - 1 ? 'bg-(image:--gradient-brand)' : 'bg-chart-bar-soft'}`}
          style={{ height: `${Math.round((v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

function Line({ values, alt }: { values: number[]; alt: string }) {
  const lo = Math.min(...values) * 0.9
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const last = Math.max(values.length - 1, 1)
  const pts = values
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'}${((i * 300) / last).toFixed(1)} ${(54 - ((v - lo) / span) * 48).toFixed(1)}`,
    )
    .join(' ')
  return (
    <svg
      role="img"
      aria-label={alt}
      viewBox="0 0 300 56"
      preserveAspectRatio="none"
      className="mt-2 block h-14 w-full"
    >
      <line
        x1="0"
        x2="300"
        y1="55.5"
        y2="55.5"
        className="stroke-line"
        vectorEffect="non-scaling-stroke"
      />
      <path d={`${pts} L300 56 L0 56 Z`} className="fill-accent/8" />
      <path
        d={pts}
        fill="none"
        className="stroke-accent"
        strokeWidth="1.75"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
