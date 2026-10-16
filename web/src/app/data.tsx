import { useState, type ReactNode } from 'react'
import { StaticJsonDataSource, type DataSource } from '../data/dataSource'
import { selectData, type Datasets, type Selection } from '../data/selection'
import { DataSourceContext } from './dataContext'

// The pages show the US marketplace in USD until the filter bar offers a choice (CR-1 PR 6b).
const DEFAULT_SELECTION: Selection = { marketplaces: ['US'], currency: 'usd' }

export function DataSourceProvider({
  source,
  children,
}: {
  source?: DataSource
  children: ReactNode
}) {
  const [ds] = useState<Datasets>(() =>
    selectData(source ?? new StaticJsonDataSource(), DEFAULT_SELECTION),
  )
  return <DataSourceContext.Provider value={ds}>{children}</DataSourceContext.Provider>
}
