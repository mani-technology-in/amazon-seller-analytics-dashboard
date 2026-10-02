import type { FilterPatch, Filters } from '../app/filters'
import type { AdProduct, Campaign, ISODate } from '../data/types'
import { PRESETS } from '../metrics/dates'
import { dateLong } from '../lib/format'

const AD_LABELS: { id: AdProduct; label: string }[] = [
  { id: 'SP', label: 'Sponsored Products' },
  { id: 'SB', label: 'Sponsored Brands' },
  { id: 'SD', label: 'Sponsored Display' },
]

interface FilterBarProps {
  filters: Filters
  update: (patch: FilterPatch) => void
  dataStart: ISODate
  dataEnd: ISODate
  showDates?: boolean
  showCompare?: boolean
  campaigns?: Campaign[] // shows ad type and campaign filters
  showTargetAcos?: boolean
  showLowStock?: boolean
}

const control =
  'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-2 focus:outline-[#2a78d6]'

/** One row of filters above the content; every value is kept in the URL. */
export function FilterBar({
  filters,
  update,
  dataStart,
  dataEnd,
  showDates = true,
  showCompare = true,
  campaigns,
  showTargetAcos,
  showLowStock,
}: FilterBarProps) {
  const { range, previous } = filters
  const adOptions = campaigns
    ? campaigns.filter(
        (c) => !filters.adProducts.length || filters.adProducts.includes(c.ad_product),
      )
    : []

  const toggleAd = (id: AdProduct) => {
    const set = new Set(filters.adProducts)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    const campaign = campaigns?.find((c) => c.campaign_id === filters.campaignId)
    const keepCampaign = !campaign || !set.size || set.has(campaign.ad_product)
    update({ ad: [...set].join(',') || null, campaign: keepCampaign ? filters.campaignId : null })
  }

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      {showDates ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Date range
            <select
              className={control}
              value={filters.preset}
              onChange={(e) => {
                const preset = e.target.value
                update(
                  preset === 'custom'
                    ? { preset, from: range.start, to: range.end }
                    : { preset, from: null, to: null },
                )
              }}
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          {filters.preset === 'custom' ? (
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                From
                <input
                  type="date"
                  className={control}
                  min={dataStart}
                  max={dataEnd}
                  value={range.start}
                  onChange={(e) => e.target.value && update({ from: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                To
                <input
                  type="date"
                  className={control}
                  min={dataStart}
                  max={dataEnd}
                  value={range.end}
                  onChange={(e) => e.target.value && update({ to: e.target.value })}
                />
              </label>
            </div>
          ) : null}
          <div className="text-xs text-slate-600">
            <div className="font-medium text-slate-900">
              {dateLong(range.start)} – {dateLong(range.end)}
            </div>
            {filters.rangeAdjusted ? (
              <p role="note" className="mt-1 text-amber-800">
                {filters.rangeAdjusted === 'outside'
                  ? 'The chosen dates have no data, so the default range is shown.'
                  : 'Dates adjusted to the data available.'}{' '}
                Data covers {dateLong(dataStart)} – {dateLong(dataEnd)}.
              </p>
            ) : null}
            {showCompare ? (
              <label className="mt-1 flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filters.compare}
                  onChange={(e) => update({ compare: e.target.checked ? null : 'off' })}
                />
                {filters.compare && previous
                  ? `Compare with ${dateLong(previous.start)} – ${dateLong(previous.end)}`
                  : filters.compare
                    ? 'Compare with previous period (not available: it starts before the data)'
                    : 'Compare with previous period'}
              </label>
            ) : null}
          </div>
        </>
      ) : null}

      {campaigns ? (
        <>
          <fieldset className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            <legend className="mb-1">Ad type</legend>
            <div className="flex flex-wrap gap-1.5">
              {AD_LABELS.map((a) => {
                const on = filters.adProducts.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleAd(a.id)}
                    title={a.label}
                    className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-[#2a78d6] bg-[#2a78d6] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                  >
                    {a.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Campaign
            <select
              className={`${control} max-w-72`}
              value={filters.campaignId ?? ''}
              onChange={(e) => update({ campaign: e.target.value || null })}
            >
              <option value="">All campaigns</option>
              {adOptions.map((c) => (
                <option key={c.campaign_id} value={c.campaign_id}>
                  {c.campaign_name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {showTargetAcos ? (
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Target ACoS
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={200}
              step={1}
              className={`${control} w-20`}
              value={Math.round(filters.targetAcos * 100)}
              onChange={(e) => update({ acos: e.target.value || null })}
            />
            %
          </span>
        </label>
      ) : null}

      {showLowStock ? (
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Low stock below
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={365}
              step={1}
              className={`${control} w-20`}
              value={filters.lowStockDays}
              onChange={(e) => update({ lowstock: e.target.value || null })}
            />
            days of cover
          </span>
        </label>
      ) : null}
    </div>
  )
}
