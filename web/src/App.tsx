import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { DataSourceProvider } from './app/data'
import { Layout, PageTitle } from './components/Layout'
import type { DataSource } from './data/dataSource'

// Each page loads its own code, so the first visit downloads only what it shows.
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
)
const AdvertisingPage = lazy(() =>
  import('./pages/AdvertisingPage').then((m) => ({ default: m.AdvertisingPage })),
)
const ProductsPage = lazy(() =>
  import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage })),
)
const ProductDetailPage = lazy(() =>
  import('./pages/ProductsPage').then((m) => ({ default: m.ProductDetailPage })),
)
const InventoryPage = lazy(() =>
  import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage })),
)

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="advertising" element={<AdvertisingPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:asin" element={<ProductDetailPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="*" element={<PageTitle title="Page not found" />} />
      </Route>
    </Routes>
  )
}

function App({ source }: { source?: DataSource }) {
  return (
    <DataSourceProvider source={source}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </DataSourceProvider>
  )
}

export default App
