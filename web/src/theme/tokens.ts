/**
 * The design tokens (design/tokens.json, W3C Design Tokens format) turned into the values the
 * app uses: CSS custom properties for the stylesheet and plain values for the charts.
 *
 * The stylesheet cannot read JSON at run time (the Content-Security-Policy allows no injected
 * styles), so src/index.css repeats these variables in its @theme block and tokens.test.ts
 * fails if the two ever differ.
 */
import raw from '../../../design/tokens.json'

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export interface Token {
  path: string[]
  type: string
  value: Json
}

const isGroup = (v: Json): v is { [key: string]: Json } =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Every token in the file, with its inherited $type and with {references} resolved. */
export function flatten(tokens: Json): Token[] {
  const found: Token[] = []
  const walk = (node: Json, path: string[], type: string | undefined) => {
    if (!isGroup(node)) return
    const own = typeof node.$type === 'string' ? node.$type : type
    if ('$value' in node) {
      if (!own) throw new Error(`Token ${path.join('.')} has no $type`)
      found.push({ path, type: own, value: node.$value })
      return
    }
    for (const [key, child] of Object.entries(node)) {
      if (!key.startsWith('$')) walk(child, [...path, key], own)
    }
  }
  walk(tokens, [], undefined)

  const byPath = new Map(found.map((t) => [t.path.join('.'), t]))
  const resolve = (v: Json, seen: string[]): Json => {
    if (typeof v === 'string' && /^\{[^}]+\}$/.test(v)) {
      const ref = v.slice(1, -1)
      const target = byPath.get(ref)
      if (!target || seen.includes(ref)) throw new Error(`Bad token reference ${v}`)
      return resolve(target.value, [...seen, ref])
    }
    if (Array.isArray(v)) return v.map((x) => resolve(x, seen))
    if (isGroup(v))
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, seen)]))
    return v
  }
  return found.map((t) => ({ ...t, value: resolve(t.value, [t.path.join('.')]) }))
}

export const TOKENS = flatten(raw as Json)

const get = (path: string): Json => {
  const t = TOKENS.find((x) => x.path.join('.') === path)
  if (!t) throw new Error(`No token ${path}`)
  return t.value
}

/** A token's value as a string (colours, dimensions, durations). */
export const token = (path: string): string => String(get(path))

// --- CSS ---------------------------------------------------------------------------------

/** "default" names the plain form: color.ink.default is --color-ink. */
const name = (parts: string[]) => parts.filter((p) => p !== 'default').join('-')

const fontFamily = (v: Json) =>
  (v as string[]).map((f) => (f.includes(' ') ? `'${f}'` : f)).join(', ')

const shadow = (v: Json) =>
  (Array.isArray(v) ? v : [v])
    .map((s) => {
      const x = s as Record<string, Json>
      return `${x.inset ? 'inset ' : ''}${x.offsetX} ${x.offsetY} ${x.blur} ${x.spread} ${x.color}`
    })
    .join(', ')

const gradient = (v: Json) =>
  `linear-gradient(168deg, ${(v as { color: string; position: number }[])
    .map((s) => `${s.color} ${Math.round(s.position * 100)}%`)
    .join(', ')})`

/**
 * The CSS custom properties, named for Tailwind's theme namespaces so that, for example,
 * color.ink.2 becomes the `text-ink-2` class. Spacing is not listed: Tailwind's 4 px step
 * already equals space.1 to space.12.
 */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const t of TOKENS) {
    const [group, ...rest] = t.path
    switch (group) {
      case 'color':
        vars[`--color-${name(rest)}`] = String(t.value)
        break
      case 'gradient':
        vars[`--gradient-${name(rest)}`] = gradient(t.value)
        break
      case 'font':
        vars[`--font-${name(rest.slice(1))}`] = fontFamily(t.value)
        break
      case 'typography': {
        const v = t.value as Record<string, Json>
        const n = `--text-${name(rest)}`
        vars[n] = String(v.fontSize)
        vars[`${n}--line-height`] = String(v.lineHeight)
        vars[`${n}--font-weight`] = String(v.fontWeight)
        vars[`${n}--letter-spacing`] = String(v.letterSpacing)
        break
      }
      case 'radius':
        vars[`--radius-${name(rest)}`] = String(t.value)
        break
      case 'shadow':
        vars[`--shadow-${name(rest)}`] = shadow(t.value)
        break
      case 'motion':
        if (rest[0] === 'easing') {
          vars[`--ease-${name(rest.slice(1))}`] =
            `cubic-bezier(${(t.value as number[]).join(', ')})`
        } else {
          vars[`--duration-${name(rest.slice(1))}`] = String(t.value)
        }
        break
      case 'space':
        break
      default:
        throw new Error(`No CSS mapping for token group ${group}`)
    }
  }
  return vars
}
