import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import type { ComposeOption } from 'echarts/core'
import type { CallbackDataParams } from 'echarts/types/dist/shared'
import type { LineSeriesOption } from 'echarts/charts'
import { SVGRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import { SERIES_COLORS } from '../lib/colors'
import { chartTooltip, type TooltipItem } from './chartTooltip'
import { dateLong, dateShort } from '../lib/format'

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])

/** Axis-tooltip params carry `axisValue` (the date), which ECharts' own type leaves out. */
function toTooltipItem(p: CallbackDataParams): TooltipItem {
  const { axisValue } = p as CallbackDataParams & { axisValue?: unknown }
  return {
    axisValue: String(axisValue ?? ''),
    seriesName: p.seriesName ?? '',
    seriesIndex: p.seriesIndex ?? 0,
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
}

/**
 * Daily line chart. One y-axis per chart: series that share it share a unit. Hovering shows a
 * crosshair and every series' value for that day. A plain table of the same numbers sits
 * under the chart for screen readers and for anyone who prefers numbers.
 */
export function TrendChart({ title, dates, series, format, height = 280 }: TrendChartProps) {
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
        textStyle: { color: '#52514e', fontSize: 12 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: '#8a8984' } },
        // our own DOM tooltip: the default one uses inline styles, which the CSP blocks
        formatter: (params) =>
          chartTooltip((Array.isArray(params) ? params : [params]).map(toTooltipItem), format),
        className: 'chart-tip-box',
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#d6d5d0' } },
        axisTick: { show: false },
        axisLabel: { color: '#52514e', formatter: (d: string) => dateShort(d), hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#ebeae6' } },
        axisLabel: { color: '#52514e', formatter: (v: number) => format(v) },
      },
      series: series.map((s, i) => ({
        type: 'line',
        name: s.name,
        data: s.values,
        showSymbol: false,
        symbolSize: 8,
        connectNulls: false,
        lineStyle: { width: 2, color: SERIES_COLORS[i] },
        itemStyle: { color: SERIES_COLORS[i] },
        emphasis: { focus: 'series' },
      })),
    }
    chart.setOption(option)
    const resize = new ResizeObserver(() => chart.resize())
    resize.observe(ref.current)
    return () => {
      resize.disconnect()
      chart.dispose()
    }
  }, [dates, series, format])

  return (
    <figure className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <figcaption className="mb-2 text-sm font-semibold text-slate-900">{title}</figcaption>
      <div ref={ref} style={{ height }} role="img" aria-label={title} />
      <details className="mt-2 text-xs text-slate-600">
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
                <tr key={d} className="border-t border-slate-100">
                  <td className="py-1 pr-4">{dateLong(d)}</td>
                  {series.map((s) => (
                    <td key={s.name} className="py-1 pr-4 text-right tabular-nums">
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
