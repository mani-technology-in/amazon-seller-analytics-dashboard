import { lazy } from 'react'
import {
  Navigate,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  useLocation,
  useParams,
} from 'react-router-dom'
import { DataSourceProvider } from './app/data'
import { Layout, PageLoadError, PageTitle } from './components/Layout'
import type { DataSource } from './data/dataSource'

// Each page loads its own code, so the first visit downloads only what it shows.
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
)
const AdvertisingPage = lazy(() =>
  import('./pages/AdvertisingPage').then((m) => ({ default: m.AdvertisingPage })),
)
const SalesPage = lazy(() => import('./pages/SalesPage').then((m) => ({ default: m.SalesPage })))
const ProductDetailPage = lazy(() =>
  import('./pages/SalesPage').then((m) => ({ default: m.ProductDetailPage })),
)

/** v1.0 Products links open the matching Sales view, filters kept (FR-16). */
function ProductsRedirect() {
  const { asin } = useParams()
  const { search } = useLocation()
  return <Navigate replace to={{ pathname: asin ? `/sales/${asin}` : '/sales', search }} />
}
const ProfitPage = lazy(() => import('./pages/ProfitPage').then((m) => ({ default: m.ProfitPage })))
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
)
const InventoryPage = lazy(() =>
  import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage })),
)

// A data router: React Router runs page changes through the View Transitions API only with one.
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Layout />} errorElement={<PageLoadError />}>
      <Route index element={<OverviewPage />} />
      <Route path="sales" element={<SalesPage />} />
      <Route path="sales/:asin" element={<ProductDetailPage />} />
      <Route path="products" element={<ProductsRedirect />} />
      <Route path="products/:asin" element={<ProductsRedirect />} />
      <Route path="advertising" element={<AdvertisingPage />} />
      <Route path="inventory" element={<InventoryPage />} />
      <Route path="profit" element={<ProfitPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="*" element={<PageTitle title="Page not found" />} />
    </Route>,
  ),
)

function App({ source }: { source?: DataSource }) {
  return (
    <DataSourceProvider source={source}>
      <RouterProvider router={router} />
    </DataSourceProvider>
  )
}

export default App
