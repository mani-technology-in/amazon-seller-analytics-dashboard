import { dateLong } from '../lib/format'

/** The parts of an ECharts axis-tooltip item this tooltip reads. */
export interface TooltipItem {
  axisValue: string
  seriesName: string
  /** the series colour, as ECharts passes it */
  color: string
  value: unknown
}

/**
 * Builds the chart tooltip as DOM nodes. ECharts' default tooltip is an HTML string with inline
 * style attributes, which the site's Content-Security-Policy (style-src 'self') blocks. Text goes
 * in through textContent (never parsed as HTML) and the swatch colour through the style object,
 * which the policy allows.
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
    swatch.style.backgroundColor = item.color
    const name = document.createElement('span')
    name.textContent = item.seriesName
    const value = document.createElement('b')
    value.textContent = format(typeof item.value === 'number' ? item.value : null)
    row.append(swatch, name, value)
    root.append(row)
  }
  return root
}
