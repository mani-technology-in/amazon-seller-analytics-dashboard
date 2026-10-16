/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PostHog project key, from the repository variable POSTHOG_KEY (empty: analytics off) */
  readonly VITE_POSTHOG_KEY?: string
}
