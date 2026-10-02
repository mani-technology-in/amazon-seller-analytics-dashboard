// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as csv from '../lib/csv'
import { DataTable, type Column } from './DataTable'
import { KpiTile } from './KpiTile'
import { FilterBar } from './FilterBar'
import { parseFilters } from '../app/filters'

afterEach(cleanup)

interface Row {
  name: string
  acos: number | null
}
const rows: Row[] = [
  { name: 'B', acos: 0.2 },
  { name: 'A', acos: null },
  { name: 'C', acos: 0.5 },
]
const columns: Column<Row>[] = [
  { id: 'name', header: 'Name', value: (r) => r.name },
  { id: 'acos', header: 'ACoS', value: (r) => r.acos, align: 'right' },
]

const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0].textContent)

describe('DataTable (FR-3)', () => {
  it('sorts numbers largest first, then smallest first, with empty values last', async () => {
    render(
      <DataTable title="T" rows={rows} columns={columns} csvName="t.csv" rowKey={(r) => r.name} />,
    )
    const header = screen.getByRole('button', { name: /ACoS/ })
    await userEvent.click(header)
    expect(names()).toEqual(['C', 'B', 'A'])
    await userEvent.click(header)
    expect(names()).toEqual(['B', 'C', 'A'])
  })

  it('exports every row as CSV in the current order', async () => {
    const download = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {})
    render(
      <DataTable
        title="T"
        rows={rows}
        columns={columns}
        csvName="t.csv"
        rowKey={(r) => r.name}
        initialSort={{ id: 'name', desc: false }}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(download).toHaveBeenCalledWith('t.csv', 'Name,ACoS\r\nA,\r\nB,0.2\r\nC,0.5\r\n')
  })

  it('says so when there is nothing to show', () => {
    render(
      <DataTable title="T" rows={[]} columns={columns} csvName="t.csv" rowKey={(r) => r.name} />,
    )
    expect(screen.getByText('Nothing to show for these filters.')).toBeInTheDocument()
  })
})

describe('KpiTile (FR-2, FR-5)', () => {
  it('shows the change against the previous period', () => {
    render(<KpiTile label="Sales" value="$120" current={120} previous={100} better="up" />)
    expect(screen.getByText(/\+20\.0%/)).toBeInTheDocument()
  })

  it('shows ratio changes in percentage points', () => {
    render(<KpiTile label="ACoS" value="32%" current={0.32} previous={0.3} better="down" points />)
    expect(screen.getByText(/\+2\.0 pts/)).toBeInTheDocument()
  })

  it('says when there is no comparison', () => {
    render(<KpiTile label="Sales" value="$1" current={1} previous={null} better="up" />)
    expect(screen.getByText('No comparison')).toBeInTheDocument()
  })
})

describe('FilterBar (FR-1)', () => {
  const show = (q: string) =>
    render(
      <FilterBar
        filters={parseFilters(new URLSearchParams(q), '2025-10-01', '2026-09-30')}
        update={() => {}}
        dataStart="2025-10-01"
        dataEnd="2026-09-30"
      />,
    )

  it('says when chosen dates have no data', () => {
    show('preset=custom&from=2024-01-01&to=2024-01-31')
    expect(screen.getByRole('note')).toHaveTextContent(
      'The chosen dates have no data, so the default range is shown. Data covers 1 Oct 2025 – 30 Sep 2026.',
    )
  })

  it('says nothing for an ordinary range', () => {
    show('preset=custom&from=2025-11-01&to=2025-12-31')
    expect(screen.queryByRole('note')).toBeNull()
  })
})
