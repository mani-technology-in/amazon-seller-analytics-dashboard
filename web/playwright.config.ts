import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke tests against a production build (`npm run build`) served by `vite preview`, with the
 * data from `make data`. CI installs Playwright's Chromium, Firefox and WebKit; locally,
 * PW_CHROMIUM can point at an existing Chromium binary, and `--project=chromium` runs one engine.
 */
const executablePath = process.env.PW_CHROMIUM || undefined

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  // Chromium covers Chrome and Edge; Firefox and WebKit (Safari's engine) cover the rest of NFR-3.
  // Tests tagged @phone run at phone size (Android on Chromium, iPhone on WebKit); the rest run on
  // desktop in all three engines.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
      grepInvert: /@phone/,
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grepInvert: /@phone/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grepInvert: /@phone/ },
    {
      name: 'android',
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
      grep: /@phone/,
    },
    { name: 'iphone', use: { ...devices['iPhone 13'] }, grep: /@phone/ },
  ],
  webServer: process.env.SMOKE_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
      },
})
