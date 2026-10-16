import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import type { ComposeOption } from 'echarts/core'
import type { DefaultLabelFormatterCallbackParams as CallbackDataParams } from 'echarts'
import type { LineSeriesOption } from 'echarts/charts'
import { SVGRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import { CHART } from '../theme/chart'
import { chartTooltip, type TooltipItem } from './chartTooltip'
import { dateLong, dateShort } from '../lib/format'

echarts.use([
  LineChart,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  SVGRenderer,
])

/** Axis-tooltip params carry `axisValue` (the date), which ECharts' own type leaves out. */
function toTooltipItem(p: CallbackDataParams): TooltipItem {
  const { axisValue } = p as CallbackDataParams & { axisValue?: unknown }
  return {
    axisValue: String(axisValue ?? ''),
    seriesName: p.seriesName ?? '',
    color: typeof p.color === 'string' ? p.color : '',
    value: p.value,
  }
}

type Option = ComposeOption<
  LineSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption
>

export interface Series {
  name: string
  values: (number | null)[]
}

interface TrendChartProps {
  title: string
  dates: string[]
  series: Series[]
  /** formats axis labels and tooltip values; one unit per chart (never two y-axes) */
  format: (v: number | null) => string
  height?: number
  /** a dashed horizontal threshold, named in the caption under the chart */
  reference?: { value: number; label: string }
  /** runs of dates to shade (e.g. out of stock), named in the caption under the chart */
  bands?: { start: string; end: string }[]
  bandLabel?: string
  /** shown under the title, e.g. what the dates mean */
  note?: string
}

/**
 * Daily line chart. One y-axis per chart: series that share it share a unit. Hovering shows a
 * crosshair and every series' value for that day. A plain table of the same numbers sits
 * under the chart for screen readers and for anyone who prefers numbers.
 */
export function TrendChart({
  title,
  dates,
  series,
  format,
  height = 280,
  reference,
  bands,
  bandLabel,
  note,
}: TrendChartProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current, null, { renderer: 'svg' })
    const option: Option = {
      animation: false,
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      legend: {
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 14,
        itemHeight: 3,
        textStyle: CHART.label,
        formatter: (name: string) => name.toUpperCase(),
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: CHART.pointer } },
        // our own DOM tooltip: the default one uses inline styles, which the CSP blocks
        formatter: (params) =>
          chartTooltip((Array.isArray(params) ? params : [params]).map(toTooltipItem), format),
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: CHART.baseline } },
        axisTick: { show: false },
        axisLabel: {
          ...CHART.label,
          formatter: (d: string) => dateShort(d).toUpperCase(),
          hideOverlap: true,
        },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: CHART.grid } },
        axisLabel: { ...CHART.label, formatter: (v: number) => format(v) },
      },
      series: series.map((s, i) => ({
        type: 'line',
        name: s.name,
        data: s.values,
        showSymbol: false,
        symbolSize: 8,
        connectNulls: false,
        lineStyle: { width: 2, color: CHART.series[i] },
        itemStyle: { color: CHART.series[i] },
        // an 8% fill under the first series only (ChartPanel in the Design System)
        areaStyle: i === 0 ? { color: CHART.series[0], opacity: 0.08 } : undefined,
        emphasis: { focus: 'series' },
        ...(i === 0 && reference
          ? {
              markLine: {
                silent: true,
                symbol: 'none',
                label: { show: false },
                lineStyle: { color: CHART.reference, type: 'dashed', width: 1.5 },
                data: [{ yAxis: reference.value }],
              },
            }
          : {}),
        ...(i === 0 && bands?.length
          ? {
              markArea: {
                silent: true,
                itemStyle: { color: CHART.band },
                data: bands.map((b) => [{ xAxis: b.start }, { xAxis: b.end }]),
              },
            }
          : {}),
      })),
    }
    chart.setOption(option)
    const resize = new ResizeObserver(() => chart.resize())
    resize.observe(ref.current)
    return () => {
      resize.disconnect()
      chart.dispose()
    }
  }, [dates, series, format, reference, bands])

  return (
    <figure className="min-w-0 rounded-lg border border-surface-sunken bg-surface-page p-4">
      <figcaption className="mb-2 text-section-title text-ink">
        {title}
        {note ? <span className="block text-caption font-normal text-ink-3">{note}</span> : null}
      </figcaption>
      <div ref={ref} style={{ height }} role="img" aria-label={title} />
      {reference || bands?.length ? (
        <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1 font-mono text-chart-label text-ink-3 uppercase">
          {reference ? (
            <span className="flex items-center gap-2">
              <i aria-hidden="true" className="w-4 border-t-2 border-dashed border-warning" />
              {reference.label}
            </span>
          ) : null}
          {bands?.length ? (
            <span className="flex items-center gap-2">
              <i aria-hidden="true" className="size-3 rounded-[3px] bg-critical-soft" />
              {bandLabel}
            </span>
          ) : null}
        </p>
      ) : null}
      <details className="mt-2 text-caption text-ink-2">
        <summary className="cursor-pointer select-none">Show as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="py-1 pr-4 font-medium">Date</th>
                {series.map((s) => (
                  <th key={s.name} className="py-1 pr-4 text-right font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((d, i) => (
                <tr key={d} className="border-t border-surface-sunken">
                  <td className="py-1 pr-4">{dateLong(d)}</td>
                  {series.map((s) => (
                    <td key={s.name} className="py-1 pr-4 text-right font-mono tabular-nums">
                      {format(s.values[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
