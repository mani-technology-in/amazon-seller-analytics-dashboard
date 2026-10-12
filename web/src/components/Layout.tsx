import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useDatasets } from '../app/useDatasets'
import { useReduceMotion } from '../app/motion'
import { dateLong } from '../lib/format'
import { ReduceMotionSwitch } from './ReduceMotionSwitch'

// The website's page order; Products stands where Sales will go, and Sales, Profit and
// Reports join this list with their pages (CR-1 PR 6 and PR 8).
const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/products', label: 'Products' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/advertising', label: 'Advertising' },
]

const BUILT_BY = (
  <a className="text-accent-strong hover:underline" href="https://manitechnology.com">
    Built by Mani Technology
  </a>
)

/** Page frame: side navigation with the store and data date, and the content area (FR-4, FR-16, FR-19). */
export function Layout() {
  const manifest = useDatasets('manifest')
  const { search } = useLocation()
  const reduced = useReduceMotion()
  const brand = manifest.status === 'ready' ? manifest.data.manifest.brand : 'Demo Brand'
  const initials = brand
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex min-h-screen flex-wrap md:flex-nowrap">
      <aside className="flex shrink-0 grow basis-full flex-col gap-3 border-b border-surface-sunken bg-surface-side px-4 py-3.5 md:w-[224px] md:basis-auto md:grow-0 md:gap-[22px] md:border-r md:border-b-0 md:px-3.5 md:py-[22px]">
        <div className="flex items-center gap-2.5 px-1.5">
          <div
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-[9px] bg-(image:--gradient-brand) text-body font-bold text-surface-page"
          >
            {initials}
          </div>
          <div>
            <div className="font-semibold">{brand}</div>
            <div className="text-caption text-ink-3">Seller workspace · Amazon US</div>
          </div>
        </div>
        <nav aria-label="Pages">
          <ul className="flex flex-wrap gap-1 md:flex-col md:gap-0.5">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={{ pathname: n.to, search }}
                  end={n.end}
                  viewTransition={!reduced}
                  className={({ isActive }) =>
                    `flex min-h-9 items-center rounded-sm px-2.5 md:min-h-10 md:px-3 ${
                      isActive
                        ? 'bg-surface-page font-semibold text-accent-strong shadow-raised'
                        : 'text-ink-2 hover:bg-surface-hover hover:text-ink'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto hidden flex-col gap-1.5 px-1.5 text-caption text-ink-3 md:flex">
          {manifest.status === 'ready' ? (
            <span>Data updated {dateLong(manifest.data.manifest.dataEnd)}</span>
          ) : null}
          {BUILT_BY}
        </div>
      </aside>
      <div className="page-band min-w-0 grow-[999] basis-[560px] px-4 pt-[18px] pb-10 md:px-8 md:pt-[22px] md:pb-14">
        <main className="page-content space-y-4">
          {manifest.status === 'error' ? (
            <ErrorBox error={manifest.error} />
          ) : manifest.status === 'loading' ? (
            <Loading />
          ) : (
            <Suspense fallback={<Loading what="page" />}>
              <Outlet context={manifest.data.manifest} />
            </Suspense>
          )}
        </main>
        <footer className="mt-10 flex flex-col gap-1.5 text-caption text-ink-3">
          <span className="md:hidden">
            {manifest.status === 'ready'
              ? `Data updated ${dateLong(manifest.data.manifest.dataEnd)} · `
              : null}
            {BUILT_BY}
          </span>
          <span>
            All products, campaigns and numbers are invented, shaped like real Amazon SP-API and
            Amazon Ads reports.
          </span>
        </footer>
      </div>
    </div>
  )
}

export function Loading({ what = 'data' }: { what?: string }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-surface-sunken bg-surface-page px-4 py-8 text-center text-small text-ink-3"
    >
      Loading {what}…
    </div>
  )
}

export function ErrorBox({ error }: { error: Error }) {
  return (
    <div role="alert" className="rounded-lg bg-critical-soft px-4 py-3 text-small text-critical">
      Could not load the dashboard data. {error.message}
    </div>
  )
}

/** The page's top row: its title, the synthetic-data label and the Reduce motion switch. */
export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="text-page-title-phone md:text-page-title">{title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-surface-page px-2.5 text-caption text-ink-2 ring-1 ring-line">
            <span aria-hidden="true" className="size-1.5 rounded-pill bg-accent" />
            Synthetic demo data
          </span>
          <ReduceMotionSwitch />
        </div>
      </div>
      {children ? <p className="text-small text-ink-3">{children}</p> : null}
    </div>
  )
}
