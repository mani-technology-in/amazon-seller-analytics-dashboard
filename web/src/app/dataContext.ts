import { createContext } from 'react'
import type { DataSource } from '../data/dataSource'

export const DataSourceContext = createContext<DataSource | null>(null)
