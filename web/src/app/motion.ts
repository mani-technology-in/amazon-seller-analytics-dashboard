import { useSyncExternalStore } from 'react'

/**
 * The "Reduce motion" setting (NFR-14), the one switch for all motion. It follows the system's
 * reduced-motion setting until the visitor flips it; their choice is then remembered in this
 * browser. While it is on, <html> carries data-reduce-motion, which index.css uses to stop
 * every transition and animation, and page changes skip the cross-fade.
 */

const KEY = 'reduce-motion'

const query =
  typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-reduced-motion: reduce)')
    : undefined

function stored(): boolean | null {
  try {
    const v = window.localStorage.getItem(KEY)
    return v === 'on' ? true : v === 'off' ? false : null
  } catch {
    return null // storage blocked (private mode, sandbox): fall back to the system setting
  }
}

let reduced = typeof window === 'undefined' ? false : (stored() ?? query?.matches ?? false)
const listeners = new Set<() => void>()

function apply() {
  if (typeof document !== 'undefined') {
    document.documentElement.toggleAttribute('data-reduce-motion', reduced)
  }
}
apply()

function notify() {
  apply()
  listeners.forEach((l) => l())
}

// A system change applies while the visitor has not chosen for this site.
query?.addEventListener?.('change', (e) => {
  if (stored() === null) {
    reduced = e.matches
    notify()
  }
})

export function setReduceMotion(on: boolean) {
  reduced = on
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // not remembered across visits; the setting still applies now
  }
  notify()
}

const snapshot = () => reduced

export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    snapshot,
    () => false,
  )
}
