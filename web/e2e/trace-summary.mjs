// Prints what the browser was doing in each failed smoke-test attempt, as GitHub annotations:
// every request with its start time and duration, the slow ones flagged, and the test's own
// log. The agent workspace cannot download CI artifacts, but it can read annotations (#26).
//
//   node e2e/trace-summary.mjs test-results
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.argv[2] ?? 'test-results'
const SLOW_MS = 2000

function traces(dir) {
  let out = []
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out = out.concat(traces(p))
    else if (name === 'trace.zip') out.push(p)
  }
  return out
}

function read(zip, file) {
  try {
    return execFileSync('unzip', ['-p', zip, file], { encoding: 'utf-8', maxBuffer: 64 << 20 })
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

for (const zip of traces(root)) {
  const events = read(zip, 'trace.trace')
  const t0 = events.find((e) => e.type === 'context-options')?.wallTime ?? 0
  const lines = []
  const browser = events.find((e) => e.type === 'context-options')?.browserName ?? '?'
  lines.push(`${relative(root, zip)} (${browser})`)
  for (const r of read(zip, 'trace.network')) {
    if (r.type !== 'resource-snapshot') continue
    const s = r.snapshot
    const start = Date.parse(s.startedDateTime) - t0
    const path = s.request.url.replace(/^https?:\/\/[^/]+/, '')
    const flag = s.time > SLOW_MS ? '  SLOW' : ''
    lines.push(
      `  +${(start / 1000).toFixed(1)}s ${s.request.method} ${path} -> ${s.response.status} in ${Math.round(s.time)} ms${flag}`,
    )
  }
  for (const e of events) {
    if (e.type === 'log') lines.push(`  log: ${e.message}`)
    if (e.type === 'after' && e.error) lines.push(`  error: ${e.error.message?.split('\n')[0]}`)
    if (e.type === 'console' && e.messageType === 'error') lines.push(`  console error: ${e.text}`)
  }
  // One annotation per trace; GitHub encodes newlines in annotation messages as %0A.
  console.log(`::warning title=Smoke trace::${lines.join('%0A')}`)
}
