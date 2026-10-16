import type { WaterfallStep } from '../metrics/profit'

interface ProfitWaterfallProps {
  steps: WaterfallStep[]
  /** compact money, e.g. $12.3K */
  format: (v: number) => string
  /** full money for the screen-reader table */
  formatFull: (v: number) => string
  /** changes when the filters change, so the chart builds again (the signature moment) */
  runKey: string
}

/**
 * The Profit page's signature moment (UI design): revenue first, then each cost dropping out of
 * it, 110 ms apart and 200 ms each, ending on the gradient net-profit bar. A loss sits below the
 * baseline in red. With Reduce motion on, the chart is simply there (index.css).
 */
export function ProfitWaterfall({ steps, format, formatFull, runKey }: ProfitWaterfallProps) {
  if (!steps.length) return null
  const values = steps.flatMap((s) => [s.from, s.to])
  // headroom above the tallest bar for its label
  const hi = (Math.max(...values, 0) || 1) * 1.1
  const lo = Math.min(...values, 0)
  const span = hi - lo
  const y = (v: number) => ((hi - v) / span) * 100 // % from the top
  const slot = 100 / steps.length
  const bw = slot * 0.56
  const net = steps[steps.length - 1]
  const summary = `Revenue ${formatFull(steps[0].to)}; after ${steps
    .slice(1, -1)
    .map((s) => `${s.label.toLowerCase()} ${formatFull(s.from - s.to)}`)
    .join(', ')}, net profit is ${formatFull(net.to)}.`

  return (
    <div>
      <div key={runKey} role="img" aria-label={summary} className="relative h-60 md:h-[300px]">
        {/* the zero line */}
        <div className="absolute inset-x-0 border-t border-line" style={{ top: `${y(0)}%` }} />
        {steps.map((s, i) => {
          const top = Math.max(s.from, s.to)
          const bottom = Math.min(s.from, s.to)
          const isNet = i === steps.length - 1
          const loss = isNet && s.to < 0
          const cls =
            s.kind === 'cost'
              ? 'wf-bar wf-drop bg-chart-bar-cost'
              : loss
                ? 'wf-bar wf-drop bg-critical'
                : isNet
                  ? 'wf-bar wf-grow bg-(image:--gradient-brand)'
                  : 'wf-bar wf-grow bg-chart-bar-soft'
          const left = i * slot + (slot - bw) / 2
          const next = steps[i + 1]
          const delay = { animationDelay: `calc(var(--duration-stagger) * ${i})` }
          const fade = { animationDelay: `calc(var(--duration-stagger) * ${i} + 140ms)` }
          return (
            <div key={s.label}>
              <div
                className={`absolute rounded-[4px] ${cls}`}
                style={{
                  left: `${left}%`,
                  width: `${bw}%`,
                  top: `${y(top)}%`,
                  height: `${Math.max(y(bottom) - y(top), 0.4)}%`,
                  ...delay,
                }}
              />
              <div
                className={`wf-fade absolute -translate-x-1/2 -translate-y-full pb-1.5 font-mono text-caption whitespace-nowrap tabular-nums ${isNet ? (loss ? 'font-medium text-critical' : 'font-medium text-ink') : 'text-ink-2'}`}
                style={{ left: `${i * slot + slot / 2}%`, top: `${y(top)}%`, ...fade }}
              >
                {s.kind === 'cost' ? `−${format(s.from - s.to)}` : format(s.to)}
              </div>
              {next && next.kind === 'cost' ? (
                <div
                  className="wf-fade absolute border-t border-dashed border-ink-disabled"
                  style={{
                    left: `${left + bw}%`,
                    width: `${slot - bw}%`,
                    top: `${y(s.kind === 'cost' ? s.to : s.to)}%`,
                    ...fade,
                  }}
                />
              ) : null}
            </div>
          )
        })}
      </div>
      <div aria-hidden="true" className="relative h-11">
        {steps.map((s, i) => (
          <span
            key={s.label}
            className={`absolute top-2 w-[14%] -translate-x-1/2 text-center text-caption leading-tight ${i === steps.length - 1 ? 'font-semibold text-ink' : 'text-ink-2'}`}
            style={{ left: `${i * slot + slot / 2}%` }}
          >
            {s.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>From revenue to net profit</caption>
        <tbody>
          {steps.map((s) => (
            <tr key={s.label}>
              <th scope="row">{s.label}</th>
              <td>{formatFull(s.kind === 'cost' ? -(s.from - s.to) : s.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
