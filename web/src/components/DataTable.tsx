import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useMemo, useState, type ReactNode } from 'react'
import { downloadCsv, toCsv } from '../lib/csv'

/** Rows drawn before "Show all". */
export const ROW_LIMIT = 100

export interface Column<T> {
  id: string
  header: string
  /** raw value: used for sorting and CSV export */
  value: (row: T) => string | number | boolean | null
  /** how the cell shows on screen; defaults to the raw value */
  cell?: (row: T) => ReactNode
  align?: 'left' | 'right'
  /** a short note shown as the header's tooltip */
  hint?: string
}

interface DataTableProps<T> {
  title: string
  rows: T[]
  columns: Column<T>[]
  csvName: string
  initialSort?: { id: string; desc: boolean }
  rowKey: (row: T) => string
  emptyText?: string
  toolbar?: ReactNode
  /** a totals row under the table: not sorted, not in the CSV; its first cell says "Total" */
  footer?: T
  /** a line under the title */
  description?: ReactNode
}

/**
 * A sortable table with CSV export (FR-3). Click a header to sort; empty values (–) always sort
 * last. The CSV holds the raw values of every row, in the current sort order.
 */
export function DataTable<T>({
  title,
  rows,
  columns,
  csvName,
  initialSort,
  rowKey,
  emptyText = 'Nothing to show for these filters.',
  toolbar,
  footer,
  description,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [initialSort] : [])
  // Long tables draw their first rows and the rest on request: drawing hundreds of rows at once
  // blocks the page (TBT). Sorting and the CSV always cover every row.
  // "Show all" applies to these rows only: new filters start again from the first rows
  const [showAllFor, setShowAllFor] = useState<T[] | null>(null)
  const showAll = showAllFor === rows

  const defs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.header,
        accessorFn: (row: T) => c.value(row),
        cell: (ctx) => (c.cell ? c.cell(ctx.row.original) : String(ctx.getValue() ?? '')),
        sortUndefined: 'last',
        sortingFn: (a, b, id) => {
          const x = a.getValue(id) as string | number | boolean | null
          const y = b.getValue(id) as string | number | boolean | null
          if (x === y) return 0
          if (x === null) return 1
          if (y === null) return -1
          return x < y ? -1 : 1
        },
        meta: c,
      })),
    [columns],
  )

  const table = useReactTable({
    data: rows,
    columns: defs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => rowKey(row),
  })

  // Nulls last in both directions: TanStack flips the comparator for "desc", so undo that for nulls.
  const sorted = table.getRowModel().rows
  const ordered = useMemo(() => {
    if (!sorting.length) return sorted
    const id = sorting[0].id
    const withValue = sorted.filter((r) => r.getValue(id) !== null)
    const without = sorted.filter((r) => r.getValue(id) === null)
    return [...withValue, ...without]
  }, [sorted, sorting])

  const exportCsv = () => {
    const csv = toCsv(
      ordered.map((r) => r.original),
      columns.map((c) => ({
        header: c.header,
        value: (row: T) => {
          const v = c.value(row)
          return typeof v === 'boolean' ? (v ? 'yes' : 'no') : v
        },
      })),
    )
    downloadCsv(csvName, csv)
  }

  return (
    <section className="min-w-0 rounded-lg border border-surface-sunken bg-surface-page">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <h2 className="text-section-title text-ink">
            {title} <span className="font-normal text-ink-3">({rows.length})</span>
          </h2>
          {description ? <p className="mt-0.5 text-small text-ink-3">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {toolbar}
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-9 items-center rounded-md border border-line bg-surface-page px-3 text-small font-semibold text-ink transition-transform duration-(--duration-press) ease-out hover:bg-surface-hover active:scale-[0.97]"
          >
            Download CSV
          </button>
        </div>
      </header>
      <div className="relative max-h-[32rem] overflow-auto">
        <table className="w-full min-w-max text-left text-body">
          <thead className="sticky top-0 z-10 bg-surface-side text-caption text-ink-3">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta as Column<T>
                  const dir = h.column.getIsSorted()
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      title={meta.hint}
                      aria-sort={
                        dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'
                      }
                      className={`whitespace-nowrap px-3 py-0.5 font-semibold ${meta.align === 'right' ? 'text-right' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex min-h-9 items-center gap-1 hover:text-ink"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {meta.hint ? <span aria-hidden="true">ⓘ</span> : null}
                        <span aria-hidden="true" className="w-3 text-accent-strong">
                          {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : ''}
                        </span>
                      </button>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {ordered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-ink-3">
                  {emptyText}
                </td>
              </tr>
            ) : (
              (showAll ? ordered : ordered.slice(0, ROW_LIMIT)).map((r) => (
                <tr key={r.id} className="border-t border-surface-sunken hover:bg-surface-hover">
                  {r.getVisibleCells().map((c) => {
                    const meta = c.column.columnDef.meta as Column<T>
                    return (
                      <td
                        key={c.id}
                        className={`whitespace-nowrap px-3 py-2.5 ${meta.align === 'right' ? 'text-right font-mono text-table-number text-ink-2 tabular-nums' : 'text-ink'}`}
                      >
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
          {!showAll && ordered.length > ROW_LIMIT ? (
            <tbody>
              <tr className="border-t border-surface-sunken">
                <td colSpan={columns.length} className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setShowAllFor(rows)}
                    className="inline-flex min-h-9 items-center rounded-md px-2 text-small font-semibold text-accent-strong hover:bg-surface-hover"
                  >
                    Show all {ordered.length} rows
                  </button>
                  <span className="text-caption text-ink-3">
                    {' '}
                    (showing the first {ROW_LIMIT}; Download CSV has every row)
                  </span>
                </td>
              </tr>
            </tbody>
          ) : null}
          {footer && ordered.length ? (
            <tfoot className="sticky bottom-0 bg-surface-side font-semibold">
              <tr className="border-t border-line">
                {columns.map((c, i) => (
                  <td
                    key={c.id}
                    className={`whitespace-nowrap px-3 py-2.5 ${c.align === 'right' ? 'text-right font-mono text-table-number text-ink tabular-nums' : 'text-ink'}`}
                  >
                    {i === 0 ? 'Total' : c.cell ? c.cell(footer) : String(c.value(footer) ?? '')}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  )
}
