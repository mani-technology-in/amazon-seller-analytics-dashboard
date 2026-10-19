import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, isAbortedFontLoad, test } from './fixtures.ts'

/**
 * Smoke test: every page renders real data with no browser errors, and the core interactions
 * work. Runs against a production build before every deploy (and against the deployed site
 * when SMOKE_BASE_URL is set).
 */

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !isAbortedFontLoad(m.text())) errors.push(m.text())
  })
  return errors
}

const PAGES = [
  {
    path: '/',
    heading: 'Overview',
    expects: ['Revenue against ad spend', 'Units by marketplace', 'Top 5 products by revenue'],
  },
  {
    path: '/sales',
    heading: 'Sales',
    expects: ['Unit session percentage', 'Revenue by marketplace', 'Share of revenue'],
  },
  {
    path: '/advertising',
    heading: 'Advertising',
    expects: ['Top 5 campaigns by spend', 'Keywords and targets', 'TACoS'],
  },
  {
    path: '/inventory',
    heading: 'Inventory',
    expects: ['Stock by product and network', 'Products low on stock', 'Stock over time'],
  },
]

for (const p of PAGES) {
  test(`${p.heading} page loads with data and no errors`, async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto(p.path)
    await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible()
    await expect(page.getByText('Synthetic demo data')).toBeVisible()
    await expect(
      page.getByText(/Data updated \d{1,2} \w{3} \d{4}/).filter({ visible: true }),
    ).toHaveCount(1)
    for (const text of p.expects) {
      await expect(page.getByText(text, { exact: false }).first()).toBeVisible()
    }
    await expect(page.getByRole('status')).toHaveCount(0) // nothing left loading
    expect(errors).toEqual([])
  })
}

test('the Overview shows KPI values, the revenue chart and units by marketplace', async ({
  page,
}) => {
  await page.goto('/')
  const kpis = page.getByRole('region', { name: 'Key figures' })
  await expect(kpis.getByText(/^\$[\d.]+[KM]$/).first()).toBeVisible()
  await expect(page.locator('figure')).toHaveCount(1)
  // the chart draws revenue and ad spend in the palette colours
  for (const color of ['#0078f0', '#783fee']) {
    await expect(page.locator(`figure svg path[stroke="${color}"]`)).toHaveCount(1)
  }
  // one small chart per marketplace, all six by default (FR-17, FR-20)
  await expect(page.getByRole('img', { name: /units per week/ })).toHaveCount(6)
})

test('one marketplace in its own currency (FR-17, FR-18)', async ({ page }) => {
  await page.goto('/sales')
  const local = page.getByRole('button', { name: 'Local currency' })
  // all marketplaces: US dollars only; the button stays focusable and says why
  await expect(local).toHaveAttribute('aria-disabled', 'true')
  await expect(local).toHaveAccessibleDescription('Pick one marketplace to see its local currency')
  await local.focus()
  await expect(local).toBeFocused()
  await page.keyboard.press('Enter') // does nothing
  await expect(page).not.toHaveURL(/cur=local/)
  await page.getByRole('combobox', { name: /^Marketplace/ }).selectOption('UK')
  await expect(page).toHaveURL(/mkt=UK/)
  await page.getByRole('button', { name: 'Local (GBP)' }).click()
  await expect(page).toHaveURL(/cur=local/)
  const kpis = page.getByRole('region', { name: 'Key figures' })
  await expect(kpis.getByText(/^£[\d.,]+[KM]?$/).first()).toBeVisible()
  await expect(page.getByRole('img', { name: /daily revenue/ })).toHaveCount(1)
  await expect(page.getByRole('columnheader', { name: /Revenue \(GBP\)/ }).first()).toBeVisible()
  // back to all marketplaces: back to US dollars
  await page.getByRole('combobox', { name: /^Marketplace/ }).selectOption('all')
  await expect(page).not.toHaveURL(/cur=local/)
  await expect(page.getByRole('img', { name: /daily revenue/ })).toHaveCount(6)
})

test('a product opens its revenue by marketplace in the Sales table (FR-11)', async ({ page }) => {
  await page.goto('/sales')
  const toggle = page.getByRole('button', { name: /^Revenue by marketplace for / }).first()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(
    page.getByRole('list', { name: 'Revenue by marketplace' }).getByRole('listitem'),
  ).toHaveCount(6)
})

test('Advertising: KPIs, the ACoS trend with the target, and no ads where none ran (FR-25, FR-26)', async ({
  page,
}) => {
  await page.goto('/advertising?acos=25')
  const kpis = page.getByRole('region', { name: 'Key figures' })
  // three marketplaces' ad files: Firefox on CI can need more than the default 5 seconds
  await expect(kpis).toBeVisible({ timeout: 15_000 })
  for (const label of ['Ad spend', 'Ad sales', 'ACoS', 'TACoS', 'ROAS']) {
    await expect(kpis.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(page.getByText('Target ACoS 25%')).toBeVisible()
  await expect(page.locator('figure svg path[stroke-dasharray]').first()).toBeAttached()
  await expect(page.getByRole('columnheader', { name: /Marketplace/ }).first()).toBeVisible()
  await page.goto('/advertising?mkt=MX')
  await expect(page.getByText(/No ads ran in Mexico/).first()).toBeVisible()
})

test('Inventory: stock over time for the lowest-cover product, with a picker (FR-23, FR-24)', async ({
  page,
}) => {
  await page.goto('/inventory')
  const kpis = page.getByRole('region', { name: 'Key figures' })
  await expect(kpis.getByText('Products out of stock')).toBeVisible()
  const chart = page.locator('figure')
  await expect(chart).toHaveCount(1)
  await expect(chart.locator('figcaption')).toContainText('Stock over time')
  const network = page.getByRole('combobox', { name: 'Network' })
  await network.selectOption({ index: 0 })
  await page.getByRole('combobox', { name: 'Product' }).selectOption({ index: 1 })
  await expect(chart.locator('figcaption')).toContainText('Stock over time')
})

test('a one-day stock-out is shaded on the stock chart', async ({ page }) => {
  await page.goto('/inventory?mkt=DE&preset=custom&from=2025-12-01&to=2025-12-14')
  await page.getByRole('combobox', { name: 'Product' }).selectOption('B01Z54AXCX')
  await page.getByRole('combobox', { name: 'Network' }).selectOption('EU')
  const chart = page.locator('figure')
  await expect(chart.locator('figcaption')).toContainText('Out of stock on 1 day in this range')
  // the band has a width: half a day either side of the stock-out day
  const band = chart.locator('svg path[fill="#fdecee"]')
  await expect(band).toHaveCount(1)
  expect((await band.boundingBox())!.width).toBeGreaterThan(10)
})

test('Profit: the chart walks from revenue to net profit, and loss-making products are flagged (FR-27 to FR-31)', async ({
  page,
}) => {
  await page.goto('/profit')
  const kpis = page.getByRole('region', { name: 'Key figures' })
  for (const label of [
    'Revenue',
    'Amazon fees',
    'Ad spend',
    'Product cost',
    'Net profit',
    'Net margin',
  ]) {
    await expect(kpis.getByText(label, { exact: true })).toBeVisible()
  }
  const chart = page.getByRole('img', { name: /^Revenue .*net profit is/ })
  await expect(chart).toBeVisible()
  // the screen-reader table lists every step
  const steps = page.getByRole('table', { name: 'From revenue to net profit' }).getByRole('row')
  await expect(steps).toHaveCount(7)
  await expect(page.getByText('Loses money').first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Total', exact: true }).first()).toBeVisible()
  // product cost says where it comes from (FR-31)
  await expect(page.getByText(/entered by the seller, not taken from Amazon/)).toBeVisible()
})

test('Reports: each report downloads a CSV with its row count, and says so (FR-32)', async ({
  page,
}) => {
  await page.goto('/reports?mkt=US')
  const item = page.getByRole('listitem').filter({ hasText: 'Product profit' })
  const rows = Number((await item.getByText(/ rows$/).textContent())!.replace(/\D/g, ''))
  expect(rows).toBeGreaterThan(0)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    item.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^product-profit-us-\d{4}-\d{2}-\d{2}-to-/)
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  const lines = Buffer.concat(chunks).toString('utf-8').trim().split(/\r?\n/)
  expect(lines[0]).toContain('Product cost, entered by the seller (USD)')
  expect(lines.length).toBe(rows + 1)
  await expect(page.getByText(/^Product profit downloaded, [\d,]+ rows\.$/)).toBeVisible()
  // a marketplace with no ads: the campaign report has nothing to download
  await page.goto('/reports?mkt=MX')
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Campaign performance' }).getByRole('button'),
  ).toBeDisabled()
})

test.describe('analytics', () => {
  // PostHog ignores browsers that call themselves headless; look like an ordinary visitor
  test.use({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  })

  test('one anonymous page view per page goes to PostHog EU, with no cookies or storage (D4)', async ({
    page,
  }) => {
    test.skip(!process.env.VITE_POSTHOG_KEY, 'this build has no PostHog key, so analytics is off')
    const events: string[] = []
    // answer for PostHog, so tests never count as visits
    await page.route('https://eu.i.posthog.com/**', async (route) => {
      events.push(route.request().url())
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' })
    })
    // analytics stays off in automated browsers; pretend to be a person for this test
    await page.addInitScript(() =>
      Object.defineProperties(Navigator.prototype, {
        webdriver: { get: () => false },
        // CI's Chromium also names itself "HeadlessChrome" in its client hints
        userAgentData: { get: () => undefined },
      }),
    )
    await page.goto('/')
    await expect.poll(() => events.length, { timeout: 15_000 }).toBeGreaterThan(0)
    expect(events.every((u) => u.startsWith('https://eu.i.posthog.com/'))).toBe(true)
    expect(await page.context().cookies()).toEqual([])
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((k) => /ph_|posthog/i.test(k))),
    ).toEqual([])
  })
})

test('old Products links open the Sales page, filters kept (FR-16)', async ({ page }) => {
  await page.goto('/products?preset=last7')
  await expect(page).toHaveURL(/\/sales\?preset=last7$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Sales' })).toBeVisible()
})

test('a product detail page opens from the products table (deep link)', async ({ page }) => {
  await page.goto('/sales')
  const first = page.locator('tbody a').first()
  const name = await first.textContent()
  await first.click()
  await expect(page).toHaveURL(/\/sales\/B0[A-Z0-9]{8}$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name!)
  await page.reload() // the URL works on its own, not only from inside the app
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name!)
})

test('filters live in the URL and change what is shown', async ({ page }) => {
  await page.goto('/advertising?ad=SB&acos=35')
  await expect(page.getByRole('button', { name: 'Sponsored Brands' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText(/Campaigns\s*\(4\)/)).toBeVisible()
  await expect(page.getByText('ACoS above 35%')).toBeVisible()

  await page.getByLabel('Date range').selectOption('last7')
  await expect(page).toHaveURL(/preset=last7/)
})

test('dates with no data fall back to the default range and say so', async ({ page }) => {
  await page.goto('/?preset=custom&from=2024-01-01&to=2024-01-31')
  await expect(page.getByRole('note')).toContainText('The chosen dates have no data')
  await expect(page.getByText(/^1 Sep 2026 – 30 Sep 2026$/)).toBeVisible()
})

test('every page passes an automated accessibility check (WCAG 2.2 AA)', async ({ page }) => {
  test.slow() // four full scans; Firefox and WebKit in CI need more than 30 seconds
  for (const path of ['/', '/sales', '/inventory', '/advertising', '/profit', '/reports']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })
    // let the Profit chart finish building: half-faded labels would fail the contrast check
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running'),
    )
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(
      violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`),
      path,
    ).toEqual([])
  }
})

test('the security headers are sent and chart tooltips break no CSP rule', async ({ page }) => {
  const violations: string[] = []
  await page.exposeFunction('reportCsp', (v: string) => violations.push(v))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { reportCsp: (v: string) => void }).reportCsp(
        `${e.violatedDirective} ${e.blockedURI}`,
      ),
    )
  })
  const errors = watchErrors(page)
  const response = await page.goto('/')
  const headers = response!.headers()
  // only our own scripts, plus Cloudflare's analytics beacon that the live domain adds
  expect(headers['content-security-policy']).toContain(
    "script-src 'self' https://static.cloudflareinsights.com;",
  )
  expect(headers['content-security-policy']).toContain("style-src 'self'")
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['strict-transport-security']).toContain('max-age=')
  // left out on purpose: it made Firefox automation miss page loads (#26), see public/_headers
  expect(headers['cross-origin-opener-policy']).toBeUndefined()
  // Cloudflare Pages' default "*" is removed: other sites cannot read the data (ZAP)
  expect(headers['access-control-allow-origin']).toBeUndefined()
  // let the page finish loading its code and data before leaving it: WebKit reports aborted
  // loads as errors
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })

  // A product detail page has charts too; open the first product from the table.
  await page.goto('/sales')
  const productPath = await page.locator('tbody a').first().getAttribute('href')
  expect(productPath).toMatch(/^\/sales\/B0/)
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })
  for (const path of ['/', productPath!]) {
    await page.goto(path)
    await expect(page.getByRole('status')).toHaveCount(0)
    const charts = await page.locator('figure').all()
    expect(charts.length, path).toBeGreaterThan(0)
    for (const chart of charts) {
      const box = await chart.locator('svg').first().boundingBox()
      expect(box, path).not.toBeNull()
      await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height / 2)
      await expect(chart.locator('.chart-tip')).toBeVisible()
    }
  }
  expect(violations).toEqual([])
  expect(errors).toEqual([])
})

test('a table exports CSV', async ({ page }) => {
  await page.goto('/inventory?mkt=US')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('inventory.csv')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  const lines = Buffer.concat(chunks).toString('utf-8').trim().split(/\r?\n/)
  expect(lines[0]).toBe('Product,Network,Available,Inbound,Avg daily units,Days of cover,Status')
  expect(lines.length).toBe(41) // header + 40 products in the US network
})

test('the page never scrolls sideways at phone width @phone', async ({ page }) => {
  for (const path of ['/', '/sales', '/inventory', '/advertising', '/profit', '/reports']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})
