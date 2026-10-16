// Writes the median Lighthouse figures of each page to the job summary (and as notices), from
// the files `lhci autorun` leaves in lhci/ (upload target "filesystem").
import { appendFileSync, readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('lhci/manifest.json', 'utf-8'))
// The median of each figure over the runs of a page, as the budgets are checked.
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const byUrl = new Map()
for (const r of manifest) {
  const lhr = JSON.parse(readFileSync(r.jsonPath, 'utf-8'))
  if (!byUrl.has(r.url)) byUrl.set(r.url, [])
  byUrl.get(r.url).push(lhr)
}
const rows = [...byUrl].map(([url, runs]) => {
  const m = (f) => median(runs.map(f))
  return {
    page: new URL(url).pathname,
    performance: Math.round(m((l) => l.categories.performance.score) * 100),
    accessibility: Math.round(m((l) => l.categories.accessibility.score) * 100),
    lcp: (m((l) => l.audits['largest-contentful-paint'].numericValue) / 1000).toFixed(1) + ' s',
    cls: m((l) => l.audits['cumulative-layout-shift'].numericValue).toFixed(3),
    tbt: Math.round(m((l) => l.audits['total-blocking-time'].numericValue)) + ' ms',
    lcpRuns: runs
      .map((l) => (l.audits['largest-contentful-paint'].numericValue / 1000).toFixed(1))
      .join(', '),
  }
})
const table = [
  '### Lighthouse (phone, simulated slow 4G, median of 3 runs)',
  '',
  '| Page | Performance | Accessibility | LCP | CLS | TBT |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows.map(
    (r) => `| ${r.page} | ${r.performance} | ${r.accessibility} | ${r.lcp} | ${r.cls} | ${r.tbt} |`,
  ),
  '',
  'Budgets: LCP over 5 s, CLS over 0.1 or accessibility under 95 fail the check; TBT over 600 ms is a warning. Target LCP: 2.5 s.',
].join('\n')
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + '\n')
for (const r of rows) {
  console.log(
    `::notice title=Lighthouse ${r.page}::performance ${r.performance}, accessibility ${r.accessibility}, LCP ${r.lcp}, CLS ${r.cls}, TBT ${r.tbt}`,
  )
}
