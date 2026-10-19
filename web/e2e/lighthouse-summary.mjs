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
function lcpDetail(l) {
  const lists = l.audits['largest-contentful-paint-element']?.details?.items ?? []
  const node = lists[0]?.items?.[0]?.node
  const phases = (lists[1]?.items ?? [])
    .map((p) => `${p.phase ?? p.label}: ${Math.round(p.timing ?? 0)} ms`)
    .join(', ')
  let slowest = null
  const walk = (chains) => {
    for (const c of Object.values(chains ?? {})) {
      if (!slowest || c.navStartToEndTime > slowest.navStartToEndTime) slowest = c
      walk(c.children)
    }
  }
  walk(l.audits['network-dependency-tree-insight']?.details?.chains)
  const last = slowest
    ? `${new URL(slowest.url).pathname} done at ${Math.round(slowest.navStartToEndTime)} ms`
    : '?'
  return `${node?.selector ?? '?'} [${phases}] last request ${last}`
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
    // what each run counted as the largest element, its timing phases and the request that
    // finished last on the critical path, to see what holds LCP back
    lcpDetail: runs.map(lcpDetail).join(' || '),
  }
})
const table = [
  `### Lighthouse (phone, simulated slow 4G, median of ${process.env.LH_RUNS ?? 3} runs)`,
  '',
  '| Page | Performance | Accessibility | LCP | CLS | TBT | LCP of each run (s) |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(
    (r) =>
      `| ${r.page} | ${r.performance} | ${r.accessibility} | ${r.lcp} | ${r.cls} | ${r.tbt} | ${r.lcpRuns} |`,
  ),
  '',
  'Fail the check: CLS over 0.1, accessibility under 95, best practices under 90 (stable from run to run). Warnings only: LCP over the 2.5 s target and TBT over 600 ms, because simulated LCP varies too much on CI (2.5 s to 5.1 s for the same page); the weekly Lighthouse run tracks it on the live site.',
].join('\n')
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + '\n')
for (const r of rows) {
  console.log(`::notice title=Lighthouse LCP detail ${r.page}::${r.lcpDetail.slice(0, 900)}`)
  console.log(
    `::notice title=Lighthouse ${r.page}::median performance ${r.performance}, accessibility ${r.accessibility}, LCP ${r.lcp} (runs ${r.lcpRuns}), CLS ${r.cls}, TBT ${r.tbt}`,
  )
}

// Each budget Lighthouse CI checked and missed, as an annotation (errors fail the job; warnings
// are reported only), so a failure can be read without the log.
try {
  const results = JSON.parse(readFileSync('.lighthouseci/assertion-results.json', 'utf-8'))
  for (const a of results.filter((r) => !r.passed)) {
    const level = a.level === 'error' ? 'error' : 'warning'
    const page = new URL(a.url).pathname
    console.log(
      `::${level} title=Lighthouse ${page}::${a.auditProperty ?? a.auditId}: ${a.actual} (budget ${a.operator} ${a.expected})`,
    )
  }
} catch {
  // no assertions were run (lhci collect only, as in the weekly run)
}
