import { useState, type ReactNode } from 'react'
import { StaticJsonDataSource, marketplaceView, type DataSource } from '../data/dataSource'
import { DataSourceContext } from './dataContext'

export function DataSourceProvider({
  source,
  children,
}: {
  source?: DataSource
  children: ReactNode
}) {
  // The v1.0 pages show the US marketplace until the marketplace filter arrives (CR-1 PR 6).
  const [ds] = useState<DataSource>(
    () => source ?? marketplaceView(new StaticJsonDataSource(), 'US'),
  )
  return <DataSourceContext.Provider value={ds}>{children}</DataSourceContext.Provider>
}
