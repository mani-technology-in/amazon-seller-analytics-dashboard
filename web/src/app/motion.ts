import { useSyncExternalStore } from 'react'

/**
 * The "Reduce motion" setting (NFR-14). It starts from the system's reduced-motion setting,
 * the visitor's choice is remembered in this browser, and while it is on <html> carries
 * data-reduce-motion, which index.css uses to stop every transition and animation.
 */

const KEY = 'reduce-motion'

function systemPrefersReduced(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

function stored(): boolean | null {
  try {
    const v = window.localStorage.getItem(KEY)
    return v === 'on' ? true : v === 'off' ? false : null
  } catch {
    return null // storage blocked (private mode, sandbox): fall back to the system setting
  }
}

let reduced = typeof window === 'undefined' ? false : (stored() ?? systemPrefersReduced())
const listeners = new Set<() => void>()

function apply() {
  if (typeof document !== 'undefined') {
    document.documentElement.toggleAttribute('data-reduce-motion', reduced)
  }
}
apply()

export function setReduceMotion(on: boolean) {
  reduced = on
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // not remembered across visits; the setting still applies now
  }
  apply()
  listeners.forEach((l) => l())
}

export function reduceMotion(): boolean {
  return reduced
}

export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    reduceMotion,
    () => false,
  )
}
