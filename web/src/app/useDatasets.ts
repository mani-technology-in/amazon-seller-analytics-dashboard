import { useContext, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Datasets as Source } from '../data/selection'
import { DataSourceContext } from './dataContext'
import { selectionFromParams } from './filters'

/** The data for the marketplaces and currency in the URL (?mkt=, ?cur=). */
export function useDataSource(): Source {
  const select = useContext(DataSourceContext)
  if (!select) throw new Error('useDataSource needs a DataSourceProvider')
  const [params] = useSearchParams()
  const sel = selectionFromParams(params)
  const key = `${sel.marketplaces.join(',')}|${sel.currency}`
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `sel`
  return useMemo(() => select(sel), [select, key])
}

export type Loaded<T> =
  { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; data: T }

type Datasets = {
  [K in keyof Source]: Awaited<ReturnType<Source[K]>>
}

/**
 * Loads several datasets at once, for the chosen marketplaces and currency. Each file is
 * downloaded once, so pages that share files do not download them twice.
 */
export function useDatasets<K extends keyof Source>(...keys: K[]): Loaded<Pick<Datasets, K>> {
  const ds = useDataSource()
  const id = keys.join(',')
  // The result remembers which data it belongs to: after a new choice of marketplace the page
  // shows the skeleton until those files arrive, never the previous marketplace's numbers.
  const [state, setState] = useState<{
    ds: Source
    id: string
    loaded: Loaded<Pick<Datasets, K>>
  } | null>(null)

  useEffect(() => {
    let live = true
    const names = id.split(',') as K[]
    Promise.all(names.map((k) => ds[k]()))
      .then((values) => {
        if (!live) return
        const data = Object.fromEntries(names.map((k, i) => [k, values[i]])) as Pick<Datasets, K>
        setState({ ds, id, loaded: { status: 'ready', data } })
      })
      .catch((error: Error) => live && setState({ ds, id, loaded: { status: 'error', error } }))
    return () => {
      live = false
    }
  }, [ds, id])

  return state && state.ds === ds && state.id === id ? state.loaded : { status: 'loading' }
}
