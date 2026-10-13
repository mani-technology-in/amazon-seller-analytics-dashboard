import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOKENS, cssVariables, flatten } from './tokens'

/** The custom properties declared in src/index.css's `@theme static { … }` block. */
function themeBlock(): Record<string, string> {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf-8')
  const block = /@theme static \{([\s\S]*?)\n\}/.exec(css)
  if (!block) throw new Error('index.css has no @theme static block')
  const vars: Record<string, string> = {}
  for (const m of block[1].matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
    if (m[2].trim() !== 'initial') vars[m[1]] = m[2].trim()
  }
  return vars
}

describe('design tokens (NFR-16)', () => {
  it('every token has a W3C type and a value of that type', () => {
    expect(TOKENS.length).toBeGreaterThan(50)
    for (const t of TOKENS) {
      const where = t.path.join('.')
      if (t.type === 'color') expect(t.value, where).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
      if (t.type === 'dimension') expect(t.value, where).toMatch(/^\d+(\.\d+)?px$/)
      if (t.type === 'duration') expect(t.value, where).toMatch(/^\d+ms$/)
      if (t.type === 'cubicBezier') expect(t.value, where).toHaveLength(4)
      if (t.type === 'fontFamily') expect(Array.isArray(t.value), where).toBe(true)
    }
  })

  it('resolves references and rejects broken ones', () => {
    expect(TOKENS.find((t) => t.path.join('.') === 'color.toast.ground')?.value).toBe('#04182f')
    expect(() => flatten({ a: { $type: 'color', $value: '{nope}' } })).toThrow(
      /Bad token reference/,
    )
    expect(() => flatten({ a: { $value: '#ffffff' } })).toThrow(/no \$type/)
  })

  it('src/index.css declares exactly the token values, nothing more or less', () => {
    expect(themeBlock()).toEqual(cssVariables())
  })

  it("switches off Tailwind's default colours, so only token colours exist", () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf-8')
    expect(css).toMatch(/@theme static \{\s*\/\*[^*]*\*\/\s*--color-\*: initial;/)
  })

  it('no component or page hard-codes a colour', () => {
    const src = new URL('..', import.meta.url).pathname
    const files = readdirSync(src, { recursive: true, encoding: 'utf-8' }).filter(
      (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith('theme'),
    )
    expect(files.length).toBeGreaterThan(20)
    const found = files.flatMap((f) => {
      const text = readFileSync(join(src, f), 'utf-8')
      const hits = text.match(
        /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(|\b(slate|gray|zinc|red|green|blue|amber)-\d{2,3}\b/g,
      )
      return hits ? [`${f}: ${hits.join(' ')}`] : []
    })
    expect(found).toEqual([])
  })

  it('the stylesheet uses colours only inside the @theme block', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf-8')
    const outside = css.replace(/@theme static \{[\s\S]*?\n\}/, '')
    expect(outside.match(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/g)).toBeNull()
  })
})
