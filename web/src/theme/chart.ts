import { TOKENS, token } from './tokens'

const chartLabel = TOKENS.find((t) => t.path.join('.') === 'typography.chart-label')!.value as {
  fontSize: string
}

/**
 * Chart colours and label style from the design tokens (ChartPanel in the Design System):
 * accent first, violet second, never more than two series in one plot. Labels are small
 * mono capitals (the one place the UI uses capitals).
 */
export const CHART = {
  series: [token('color.accent.default'), token('color.violet')],
  grid: token('color.surface.sunken'),
  baseline: token('color.line.default'),
  pointer: token('color.ink.3'),
  label: {
    color: token('color.ink.3'),
    fontFamily: token('font.family.mono'),
    fontSize: parseFloat(chartLabel.fontSize), // ECharts' SVG text has no letter spacing
  },
} as const
