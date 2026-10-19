import { lazy, Suspense } from 'react'
import type { TrendChartProps } from './TrendChartImpl'

export type { Series } from './TrendChartImpl'

// The chart library is the largest download in the app (about 180 KB compressed). Loading it
// apart from the page lets titles, tiles and tables appear first, which keeps LCP down; the
// chart's place is held by a box of the same height until it arrives.
const Chart = lazy(() => import('./TrendChartImpl'))

export function TrendChart(props: TrendChartProps) {
  return (
    <Suspense
      fallback={
        <figure className="min-w-0 rounded-lg border border-surface-sunken bg-surface-page p-4">
          <figcaption className="mb-2 text-section-title text-ink">{props.title}</figcaption>
          <div
            className="animate-pulse rounded-md bg-skeleton"
            style={{ height: props.height ?? 280 }}
          />
        </figure>
      }
    >
      <Chart {...props} />
    </Suspense>
  )
}
