import { createContext } from 'react'
import type { Datasets, Selection } from '../data/selection'

/** Gives the datasets for a choice of marketplaces and currency (cached per choice). */
export type SelectData = (selection: Selection) => Datasets

export const DataSourceContext = createContext<SelectData | null>(null)
