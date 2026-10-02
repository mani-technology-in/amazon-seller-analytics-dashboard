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
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [initialSort] : [])

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
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {title} <span className="font-normal text-slate-500">({rows.length})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {toolbar}
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </button>
        </div>
      </header>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600">
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
                      className={`whitespace-nowrap px-3 py-2 font-medium ${meta.align === 'right' ? 'text-right' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {meta.hint ? <span aria-hidden="true">ⓘ</span> : null}
                        <span aria-hidden="true" className="w-3 text-slate-400">
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
                <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">
                  {emptyText}
                </td>
              </tr>
            ) : (
              ordered.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  {r.getVisibleCells().map((c) => {
                    const meta = c.column.columnDef.meta as Column<T>
                    return (
                      <td
                        key={c.id}
                        className={`whitespace-nowrap px-3 py-2 ${meta.align === 'right' ? 'text-right tabular-nums' : ''}`}
                      >
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
