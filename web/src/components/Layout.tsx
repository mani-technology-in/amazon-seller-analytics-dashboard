import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useDatasets } from '../app/useDatasets'
import { dateLong } from '../lib/format'

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/advertising', label: 'Advertising' },
  { to: '/products', label: 'Products' },
  { to: '/inventory', label: 'Inventory' },
]

/** Page frame: brand, navigation, the synthetic-data label and the data's last date (FR-4). */
export function Layout() {
  const manifest = useDatasets('manifest')
  const { search } = useLocation()

  return (
    <div className="min-h-screen bg-[#f6f6f4] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Seller analytics
            </div>
            <div className="text-lg font-semibold">
              {manifest.status === 'ready' ? manifest.data.manifest.brand : 'Demo Brand'}
              <span className="font-normal text-slate-500"> · Amazon US</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="rounded-full bg-[#fff4dc] px-3 py-1 font-medium text-[#7a5200] ring-1 ring-inset ring-[#fab219]/40">
              <span aria-hidden="true">▲ </span>Synthetic demo data
            </span>
            {manifest.status === 'ready' ? (
              <span>
                Data through{' '}
                <strong className="font-semibold text-slate-900">
                  {dateLong(manifest.data.manifest.dataEnd)}
                </strong>
              </span>
            ) : null}
          </div>
        </div>
        <nav aria-label="Pages" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pt-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={{ pathname: n.to, search }}
              end={n.end}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-3 pb-2 text-sm font-medium ${isActive ? 'border-[#2a78d6] text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
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
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-slate-500">
        A demo by{' '}
        <a className="underline hover:text-slate-900" href="https://manitechnology.com">
          Mani Technology
        </a>
        . All products, campaigns and numbers are invented, shaped like real Amazon SP-API and
        Amazon Ads reports.
      </footer>
    </div>
  )
}

export function Loading({ what = 'data' }: { what?: string }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500"
    >
      Loading {what}…
    </div>
  )
}

export function ErrorBox({ error }: { error: Error }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-[#d03b3b]/40 bg-[#fbe9e9] px-4 py-3 text-sm text-[#9e2a2a]"
    >
      Could not load the dashboard data. {error.message}
    </div>
  )
}

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      {children ? <p className="mt-1 text-sm text-slate-600">{children}</p> : null}
    </div>
  )
}
