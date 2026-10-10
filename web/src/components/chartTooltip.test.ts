// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { chartTooltip } from './chartTooltip'

const params = [
  { axisValue: '2026-09-14', seriesName: 'Total sales', seriesIndex: 0, value: 1234.5 },
  { axisValue: '2026-09-14', seriesName: 'Ad spend', seriesIndex: 1, value: null },
]
const format = (v: number | null) => (v === null ? '–' : `$${v.toFixed(2)}`)

describe('chartTooltip', () => {
  it('shows the long date and each series with its formatted value', () => {
    const el = chartTooltip(params, format)
    expect(el.textContent).toContain('14 Sep 2026')
    expect(el.textContent).toContain('Total sales')
    expect(el.textContent).toContain('$1234.50')
    expect(el.textContent).toContain('Ad spend')
    expect(el.textContent).toContain('–')
  })

  it('uses no inline style attributes, so a strict Content-Security-Policy does not block it', () => {
    const el = chartTooltip(params, format)
    expect(el.outerHTML).not.toContain('style=')
    expect(el.querySelectorAll('[data-series="0"]')).toHaveLength(1)
    expect(el.querySelectorAll('[data-series="1"]')).toHaveLength(1)
  })

  it('treats series names as text, never as HTML', () => {
    const el = chartTooltip([{ ...params[0], seriesName: '<img src=x onerror=alert(1)>' }], format)
    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})
