import { dateLong } from '../lib/format'

/** The parts of an ECharts axis-tooltip item this tooltip reads. */
export interface TooltipItem {
  axisValue: string
  seriesName: string
  seriesIndex: number
  value: unknown
}

/**
 * Builds the chart tooltip as DOM nodes with classes only. ECharts' default tooltip writes
 * inline style attributes, which the site's Content-Security-Policy (style-src 'self') blocks;
 * series colours come from the stylesheet instead (`.chart-tip [data-series]`).
 */
export function chartTooltip(
  items: TooltipItem[],
  format: (v: number | null) => string,
): HTMLElement {
  const root = document.createElement('div')
  root.className = 'chart-tip'
  const date = document.createElement('p')
  date.className = 'chart-tip-date'
  date.textContent = items.length ? dateLong(items[0].axisValue) : ''
  root.append(date)
  for (const item of items) {
    const row = document.createElement('p')
    row.className = 'chart-tip-row'
    const swatch = document.createElement('span')
    swatch.className = 'chart-tip-swatch'
    swatch.dataset.series = String(item.seriesIndex)
    const name = document.createElement('span')
    name.textContent = item.seriesName
    const value = document.createElement('b')
    value.textContent = format(typeof item.value === 'number' ? item.value : null)
    row.append(swatch, name, value)
    root.append(row)
  }
  return root
}
