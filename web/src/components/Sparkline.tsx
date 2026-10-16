/** A small trend line for a KPI tile; decoration only, the tile states the figures. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const d = values
    .map((v, i) => {
      const x = (i * 72) / (values.length - 1)
      const y = 21 - ((v - lo) / span) * 18
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      width="72"
      height="24"
      viewBox="0 0 72 24"
      aria-hidden="true"
      className="hidden shrink-0 sm:block"
    >
      <path
        d={d}
        fill="none"
        className="stroke-accent"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
