import { expect, test, type Page } from '@playwright/test'

/**
 * Smoke test: every page renders real data with no browser errors, and the core interactions
 * work. Runs against a production build before every deploy (and against the deployed site
 * when SMOKE_BASE_URL is set).
 */

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

const PAGES = [
  { path: '/', heading: 'Overview', expects: ['Total sales', 'Top 5 products by sales'] },
  { path: '/advertising', heading: 'Advertising', expects: ['Campaigns', 'Keywords and targets'] },
  { path: '/products', heading: 'Products', expects: ['Conv. rate', 'TACoS'] },
  { path: '/inventory', heading: 'Inventory', expects: ['FBA inventory', 'Days of cover'] },
]

for (const p of PAGES) {
  test(`${p.heading} page loads with data and no errors`, async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto(p.path)
    await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible()
    await expect(page.getByText('Synthetic demo data')).toBeVisible()
    await expect(page.getByText(/Data through \d{1,2} \w{3} \d{4}/)).toBeVisible()
    for (const text of p.expects) {
      await expect(page.getByText(text, { exact: false }).first()).toBeVisible()
    }
    await expect(page.getByRole('status')).toHaveCount(0) // nothing left loading
    expect(errors).toEqual([])
  })
}

test('the Overview shows KPI values and draws both charts', async ({ page }) => {
  await page.goto('/')
  const kpis = page.getByRole('region', { name: 'Key figures' })
  await expect(kpis.getByText(/^\$[\d.]+[KM]$/).first()).toBeVisible()
  await expect(page.locator('figure')).toHaveCount(2)
  // each chart draws its two series lines in the palette colours
  for (const color of ['#2a78d6', '#eb6834']) {
    await expect(page.locator(`figure svg path[stroke="${color}"]`)).toHaveCount(2)
  }
})

test('a product detail page opens from the products table (deep link)', async ({ page }) => {
  await page.goto('/products')
  const first = page.locator('tbody a').first()
  const name = await first.textContent()
  await first.click()
  await expect(page).toHaveURL(/\/products\/B0[A-Z0-9]{8}$/)
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

test('a table exports CSV', async ({ page }) => {
  await page.goto('/inventory')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('inventory.csv')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  const lines = Buffer.concat(chunks).toString('utf-8').trim().split(/\r?\n/)
  expect(lines[0]).toBe('Product,Category,Available,Inbound,Avg daily units,Days of cover,Status')
  expect(lines.length).toBe(41) // header + 40 products
})

test('the page never scrolls sideways at phone width @phone', async ({ page }) => {
  for (const path of ['/', '/advertising', '/products', '/inventory']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})
