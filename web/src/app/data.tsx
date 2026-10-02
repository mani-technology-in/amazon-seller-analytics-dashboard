import { useState, type ReactNode } from 'react'
import { StaticJsonDataSource, type DataSource } from '../data/dataSource'
import { DataSourceContext } from './dataContext'

export function DataSourceProvider({
  source,
  children,
}: {
  source?: DataSource
  children: ReactNode
}) {
  const [ds] = useState<DataSource>(() => source ?? new StaticJsonDataSource())
  return <DataSourceContext.Provider value={ds}>{children}</DataSourceContext.Provider>
}
