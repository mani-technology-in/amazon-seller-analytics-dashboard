// Writes the median Lighthouse figures of each page to the job summary (and as notices), from
// the files `lhci autorun` leaves in lhci/ (upload target "filesystem").
import { appendFileSync, readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('lhci/manifest.json', 'utf-8'))
const rows = manifest
  .filter((r) => r.isRepresentativeRun)
  .map((r) => {
    const lhr = JSON.parse(readFileSync(r.jsonPath, 'utf-8'))
    const a = lhr.audits
    return {
      page: new URL(r.url).pathname,
      performance: Math.round(lhr.categories.performance.score * 100),
      accessibility: Math.round(lhr.categories.accessibility.score * 100),
      lcp: (a['largest-contentful-paint'].numericValue / 1000).toFixed(1) + ' s',
      cls: a['cumulative-layout-shift'].numericValue.toFixed(3),
      tbt: Math.round(a['total-blocking-time'].numericValue) + ' ms',
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
  'Budgets: LCP over 3.5 s, CLS over 0.1 or accessibility under 95 fail the check; TBT over 600 ms is a warning. Target LCP: 2.5 s.',
].join('\n')
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + '\n')
for (const r of rows) {
  console.log(
    `::notice title=Lighthouse ${r.page}::performance ${r.performance}, accessibility ${r.accessibility}, LCP ${r.lcp}, CLS ${r.cls}, TBT ${r.tbt}`,
  )
}
