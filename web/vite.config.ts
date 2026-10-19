/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Preloads the two Latin fonts from index.html. Without it the browser finds a font only after
 * the CSS, it arrives together with the data files, and the text repaints in it late, which
 * Lighthouse counts as a late LCP. JetBrains Mono was added after the CR-1 test report (D-2):
 * on the live demo, runs where it arrived last had LCP render delays of 5.6-9.0 s, against
 * about 3 s when it came early.
 */
const PRELOAD_FONTS = [
  /plus-jakarta-sans-latin-wght-normal-[\w-]+\.woff2$/,
  /jetbrains-mono-latin-wght-normal-[\w-]+\.woff2$/,
]

function preloadTextFont(): Plugin {
  return {
    name: 'preload-text-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {})
        return PRELOAD_FONTS.map((pattern) => {
          const font = files.find((f) => pattern.test(f))
          if (!font) throw new Error(`preload-text-font: no font file matches ${pattern}`)
          return {
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: `/${font}`,
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
            },
            injectTo: 'head' as const,
          }
        })
      },
    },
  }
}

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
  plugins: [react(), tailwindcss(), preloadTextFont()],
  preview: { headers: siteHeaders() },
  // Fonts stay files: Vite would inline the smallest font subsets as data: URLs, which the
  // Content-Security-Policy (font-src 'self') blocks.
  build: { assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined) },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**'],
    passWithNoTests: true,
  },
})
