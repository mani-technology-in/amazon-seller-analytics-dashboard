import type { FilterPatch } from '../app/filters'
import { dateLong } from '../lib/format'
import type { DateRange } from '../metrics/dates'

/** Empty state for a range with no sales (UI design): says so, and offers the default range. */
export function NoSales({
  range,
  update,
}: {
  range: DateRange
  update: (patch: FilterPatch) => void
}) {
  return (
    <section
      aria-label="No sales"
      className="flex flex-col items-start gap-3 rounded-lg border border-surface-sunken bg-surface-page px-[18px] py-6"
    >
      <p className="text-body text-ink">
        No sales from {dateLong(range.start)} to {dateLong(range.end)}.
      </p>
      <button
        type="button"
        onClick={() => update({ preset: 'last30', from: null, to: null })}
        className="inline-flex h-10 items-center rounded-md bg-accent-strong px-4 font-semibold text-surface-page hover:bg-accent-strong-hover"
      >
        Show last 30 days
      </button>
    </section>
  )
}
