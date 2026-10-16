import { expect, test } from './fixtures.ts'

/** The page frame from the CR-1 UI design: navigation, labels and the Reduce motion switch. */

const PAGES = [
  { path: '/', name: 'Overview' },
  { path: '/sales', name: 'Sales' },
  { path: '/inventory', name: 'Inventory' },
  { path: '/advertising', name: 'Advertising' },
]

test('every page has the side navigation in the website order, with the current page marked (FR-16)', async ({
  page,
}) => {
  for (const p of PAGES) {
    await page.goto(p.path)
    const nav = page.getByRole('navigation', { name: 'Pages' })
    await expect(nav.getByRole('link')).toHaveText(PAGES.map((x) => x.name))
    await expect(nav.locator('[aria-current="page"]')).toHaveText(p.name)
  }
})

test('every page says the data is synthetic and links to Mani Technology (FR-19)', async ({
  page,
}) => {
  for (const p of PAGES) {
    await page.goto(p.path)
    await expect(page.getByText('Synthetic demo data')).toBeVisible()
    const link = page
      .getByRole('link', { name: 'Built by Mani Technology' })
      .filter({ visible: true })
    await expect(link).toHaveCount(1)
    await expect(link).toHaveAttribute('href', 'https://manitechnology.com')
  }
})

test('Reduce motion turns motion off and is remembered (NFR-14)', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  const toggle = page.getByRole('switch', { name: 'Reduce motion' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(html).not.toHaveAttribute('data-reduce-motion')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(html).toHaveAttribute('data-reduce-motion')
  const thumb = toggle.locator('span span')
  expect(await thumb.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')

  await page.reload()
  await expect(page.getByRole('switch', { name: 'Reduce motion' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

test.describe('with the system set to reduce motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('Reduce motion starts on (NFR-14)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('switch', { name: 'Reduce motion' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})

test('the side navigation becomes a row above the page at phone width @phone', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Pages' })
  const heading = page.getByRole('heading', { level: 1 })
  const navBox = (await nav.boundingBox())!
  const headingBox = (await heading.boundingBox())!
  expect(navBox.y + navBox.height).toBeLessThanOrEqual(headingBox.y)
  for (const link of await nav.getByRole('link').all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(36) // touch target
  }
})

test('page changes cross-fade, except with Reduce motion on', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { transitions: number }
    w.transitions = 0
    const original = document.startViewTransition?.bind(document)
    if (original) {
      document.startViewTransition = ((cb: () => void) => {
        w.transitions += 1
        return original(cb)
      }) as typeof document.startViewTransition
    }
  })
  await page.goto('/')
  const supported = await page.evaluate(() => 'startViewTransition' in document)
  test.skip(!supported, 'this browser has no View Transitions API; pages change without one')
  const nav = page.getByRole('navigation', { name: 'Pages' })
  const count = () =>
    page.evaluate(() => (window as unknown as { transitions: number }).transitions)

  await nav.getByRole('link', { name: 'Sales' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sales' })).toBeVisible()
  expect(await count()).toBe(1)

  await page.getByRole('switch', { name: 'Reduce motion' }).click()
  await nav.getByRole('link', { name: 'Inventory' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible()
  expect(await count()).toBe(1)
})

test('a page whose code cannot load says so and offers Try again', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await page.route('**/assets/InventoryPage-*.js', (route) => route.abort())
  await page
    .getByRole('navigation', { name: 'Pages' })
    .getByRole('link', { name: 'Inventory' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'The page did not load' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})
