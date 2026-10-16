/**
 * Anonymous page views with PostHog (design D4): EU cloud, no cookies or browser storage
 * (persistence "memory"), no session replay, no autocapture, no feature flags, nothing loaded
 * from PostHog's servers (the "no-external" build). The project key comes from the repository
 * variable POSTHOG_KEY at build time; without it analytics is off. It also stays off in
 * automated browsers, so tests never count as visits.
 */
type PostHogLike = { capture: (event: string, props?: Record<string, unknown>) => unknown }

const KEY = import.meta.env.VITE_POSTHOG_KEY
const HOST = 'https://eu.i.posthog.com'

let client: Promise<PostHogLike | null> | null = null

function load(): Promise<PostHogLike | null> {
  if (!client) {
    client =
      !KEY || navigator.webdriver
        ? Promise.resolve(null)
        : import('posthog-js/dist/module.slim.no-external')
            .then(({ posthog }) => {
              posthog.init(KEY, {
                api_host: HOST,
                persistence: 'memory',
                person_profiles: 'never',
                autocapture: false,
                capture_pageview: false,
                capture_pageleave: false,
                disable_session_recording: true,
                advanced_disable_flags: true,
                capture_exceptions: false,
              })
              return posthog as unknown as PostHogLike
            })
            .catch(() => null) // analytics must never break the page
  }
  return client
}

/** Counts a page view; the library downloads after the page is idle, off the critical path. */
export function trackPageView(path: string): void {
  if (!KEY) return
  const send = () =>
    void load().then((ph) => ph?.capture('$pageview', { $current_url: location.origin + path }))
  if ('requestIdleCallback' in window) requestIdleCallback(send, { timeout: 4000 })
  else setTimeout(send, 2000)
}
