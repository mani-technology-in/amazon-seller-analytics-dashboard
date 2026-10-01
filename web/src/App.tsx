const PAGES = ['Overview', 'Advertising', 'Products', 'Inventory'] as const

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-lg font-semibold">Amazon Seller Analytics Dashboard</h1>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
            Synthetic demo data
          </span>
        </div>
        <nav aria-label="Pages" className="mx-auto flex max-w-6xl gap-4 px-4 pb-3 text-sm">
          {PAGES.map((page) => (
            <span key={page} className="text-slate-500">
              {page}
            </span>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-slate-600">
          Project scaffold. The dashboard pages are built in later pull requests.
        </p>
      </main>
    </div>
  )
}

export default App
