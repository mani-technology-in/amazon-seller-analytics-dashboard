import { test as base } from '@playwright/test'

/**
 * Pages are ready when their content shows, which every test waits for itself. The browser's
 * "load" event also waits for fonts and every data file; on a slow link Firefox can hold it for
 * over 30 seconds (#26), so navigation here only waits for the HTML to be parsed.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page)
    const reload = page.reload.bind(page)
    page.goto = (url, options) => goto(url, { waitUntil: 'domcontentloaded', ...options })
    page.reload = (options) => reload({ waitUntil: 'domcontentloaded', ...options })
    await provide(page) // Playwright's fixture callback, named so the React hooks lint rule does not mistake it
  },
})

export { expect } from '@playwright/test'

/**
 * Firefox logs a font download that a test cut short by moving to the next page
 * (NS_BINDING_ABORTED, status 2152398850) as an error; it is not a fault in the page.
 */
export function isAbortedFontLoad(message: string): boolean {
  return (
    message.includes('downloadable font: download failed') && message.includes('status=2152398850')
  )
}
