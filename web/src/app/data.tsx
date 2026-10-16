import { useState, type ReactNode } from 'react'
import { StaticJsonDataSource, type DataSource } from '../data/dataSource'
import { selectData, type Datasets, type Selection } from '../data/selection'
import { DataSourceContext, type SelectData } from './dataContext'

export function DataSourceProvider({
  source,
  children,
}: {
  source?: DataSource
  children: ReactNode
}) {
  // One data source for the visit (it keeps each downloaded file), and one view of it per
  // choice of marketplaces and currency, so switching back and forth downloads nothing again.
  const [select] = useState<SelectData>(() => {
    const ds = source ?? new StaticJsonDataSource()
    const views = new Map<string, Datasets>()
    return (sel: Selection): Datasets => {
      const key = `${sel.marketplaces.join(',')}|${sel.currency}`
      let v = views.get(key)
      if (!v) {
        v = selectData(ds, sel)
        views.set(key, v)
      }
      return v
    }
  })
  return <DataSourceContext.Provider value={select}>{children}</DataSourceContext.Provider>
}
