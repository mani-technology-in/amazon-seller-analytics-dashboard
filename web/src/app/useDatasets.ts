import { useContext, useEffect, useState } from 'react'
import type { DataSource } from '../data/dataSource'
import { DataSourceContext } from './dataContext'

export function useDataSource(): DataSource {
  const ds = useContext(DataSourceContext)
  if (!ds) throw new Error('useDataSource needs a DataSourceProvider')
  return ds
}

export type Loaded<T> =
  { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; data: T }

type Datasets = {
  [K in keyof DataSource]: Awaited<ReturnType<DataSource[K]>>
}

/**
 * Loads several datasets at once. The data source caches each file, so pages that share files
 * do not download them twice.
 */
export function useDatasets<K extends keyof DataSource>(...keys: K[]): Loaded<Pick<Datasets, K>> {
  const ds = useDataSource()
  const [state, setState] = useState<Loaded<Pick<Datasets, K>>>({ status: 'loading' })
  const id = keys.join(',')

  useEffect(() => {
    let live = true
    const names = id.split(',') as K[]
    Promise.all(names.map((k) => ds[k]()))
      .then((values) => {
        if (!live) return
        const data = Object.fromEntries(names.map((k, i) => [k, values[i]])) as Pick<Datasets, K>
        setState({ status: 'ready', data })
      })
      .catch((error: Error) => live && setState({ status: 'error', error }))
    return () => {
      live = false
    }
  }, [ds, id])

  return state
}
