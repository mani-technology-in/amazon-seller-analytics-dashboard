/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The security headers Cloudflare Pages sends (public/_headers, the "/*" block), applied to
 * `vite preview` too, so the browser smoke test runs under the same Content-Security-Policy
 * as the live site.
 */
function siteHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  let inBlock = false
  for (const line of readFileSync(new URL('./public/_headers', import.meta.url), 'utf-8').split(
    '\n',
  )) {
    if (!line.trim()) continue
    if (!/^\s/.test(line)) {
      inBlock = line.trim() === '/*'
      continue
    }
    const at = line.indexOf(':')
    if (inBlock && at > 0) headers[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return headers
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: { headers: siteHeaders() },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**'],
    passWithNoTests: true,
  },
})
