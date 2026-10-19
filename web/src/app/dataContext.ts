import { createContext } from 'react'
import type { Datasets } from '../data/selection'

export const DataSourceContext = createContext<Datasets | null>(null)
