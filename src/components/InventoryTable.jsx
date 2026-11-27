import React from "react"
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { ChevronLeft, ChevronRight, ClipboardList } from "lucide-react"
import { Button } from "./ui/button"

export function InventoryTable({ rows, columns, page, pageSize, total, busy, setPage }) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: row => String(row.id ?? row.ma_sp),
    manualPagination: true,
    rowCount: total,
    state: { pagination: { pageIndex: page, pageSize } },
    onPaginationChange: updater => {
      setPage(pageIndex => updater({ pageIndex, pageSize }).pageIndex)
    },
  })

  return (
    <>
      <div className="tablewrap inv-main-tablewrap" aria-busy={busy}>
        <table className="inv-main-table" role="table" aria-label="Danh sách mã hàng">
          <thead role="rowgroup">
            {table.getHeaderGroups().map(group => (
              <tr role="row" key={group.id}>
                {group.headers.map(header => (
                  <th role="columnheader" key={header.id} scope="col" className={header.column.columnDef.meta?.className}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody role="rowgroup">
            {table.getRowModel().rows.map(row => (
              <tr role="row" key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <td role="cell" key={cell.id} data-column={cell.column.id}
                    className={cell.column.columnDef.meta?.className}>
                    {cell.column.id !== "detail" && (
                      <span className="inv-mobile-label" aria-hidden="true">{cell.column.columnDef.header}</span>
                    )}
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!busy && rows.length === 0 && (
          <p className="empty flex items-center justify-center gap-2">
            <ClipboardList size={18} aria-hidden="true" />
            Không có mã hàng phù hợp trên trang này.
          </p>
        )}
      </div>
      <div className="pager">
        <Button type="button" variant="outline" disabled={busy || !table.getCanPreviousPage()} onClick={() => table.previousPage()}>
          <ChevronLeft size={16} aria-hidden="true" /> Trước
        </Button>
        <span>Trang {page + 1} / {Math.max(1, table.getPageCount())}</span>
        <Button type="button" variant="outline" disabled={busy || !table.getCanNextPage()} onClick={() => table.nextPage()}>
          Sau <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </>
  )
}
