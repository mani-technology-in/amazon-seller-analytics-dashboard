import { useSearchParams } from 'react-router-dom'
import { moneyFormat, type MoneyFormat } from '../lib/format'
import { displayCurrency, parseSelection } from './filters'

/** Money formatters for the currency on screen: US dollars, or the one marketplace's own. */
export function useMoney(): MoneyFormat {
  const [params] = useSearchParams()
  return moneyFormat(displayCurrency(parseSelection(params)))
}
