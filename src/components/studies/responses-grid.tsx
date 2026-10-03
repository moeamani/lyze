"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, Columns3Icon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type GridColumn = { id: string; name: string; label: string; numeric: boolean };
export type GridRow = { id: string; status: string; statusLabel: string; submitted: string | null; excluded: boolean; cells: Record<string, string | number | null> };

const STATUS_VARIANT: Record<string, "success" | "outline" | "secondary"> = { complete: "success", partial: "outline", screened_out: "secondary", over_quota: "secondary" };

/**
 * Response browser for larger screens: every answer as a column (readable labels), sortable,
 * searchable, with a column picker. Phones get the card list instead.
 */
export function ResponsesGrid({ columns, rows, base }: { columns: GridColumn[]; rows: GridRow[]; base: string }) {
  const t = useTranslations("responses");
  const [sorting, setSorting] = useState<SortingState>([{ id: "submitted", desc: true }]);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<VisibilityState>(() => Object.fromEntries(columns.map((c, i) => [c.id, i < 6])));

  const defs = useMemo<ColumnDef<GridRow>[]>(
    () => [
      {
        id: "status",
        header: t("filter"),
        accessorFn: (r) => r.statusLabel,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <Badge variant={STATUS_VARIANT[row.original.status] ?? "outline"}>{row.original.statusLabel}</Badge>
            {row.original.excluded && <Badge variant="destructive">{t("excludedBadge")}</Badge>}
          </span>
        ),
        enableHiding: false,
      },
      {
        id: "submitted",
        header: t("submitted"),
        accessorFn: (r) => r.submitted ?? "",
        cell: ({ getValue }) => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{(getValue() as string).replace("T", " ").slice(0, 16) || "—"}</span>,
        enableHiding: false,
      },
      ...columns.map<ColumnDef<GridRow>>((c) => ({
        id: c.id,
        header: () => (
          <span title={c.label} className="block max-w-48 truncate">
            {c.name} · {c.label}
          </span>
        ),
        accessorFn: (r) => r.cells[c.id] ?? null,
        sortingFn: c.numeric ? "basic" : "alphanumeric",
        sortUndefined: "last",
        cell: ({ getValue }) => {
          const v = getValue() as string | number | null;
          return v === null || v === "" ? <span className="text-muted-foreground">—</span> : <span className={cn("block max-w-64 truncate", c.numeric && "tabular-nums")} title={String(v)}>{String(v)}</span>;
        },
      })),
      {
        id: "open",
        header: () => <span className="sr-only">{t("view")}</span>,
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={`${base}/responses/${row.original.id}`} aria-label={t("view")}>
              <ChevronRightIcon className="rtl:rotate-180" />
            </Link>
          </Button>
        ),
        enableHiding: false,
        enableSorting: false,
      },
    ],
    [columns, base, t],
  );

  const table = useReactTable({
    data: rows,
    columns: defs,
    state: { sorting, globalFilter: search, columnVisibility: visibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    onColumnVisibilityChange: setVisibility,
    globalFilterFn: (row, _id, value: string) => {
      const q = value.toLowerCase();
      return Object.values(row.original.cells).some((c) => c !== null && String(c).toLowerCase().includes(q));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-9 ps-9" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ms-auto">
              <Columns3Icon />
              {t("columns")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-72">
            <DropdownMenuLabel>{t("columns")}</DropdownMenuLabel>
            {table
              .getAllLeafColumns()
              .filter((c) => c.getCanHide())
              .map((c) => {
                const meta = columns.find((x) => x.id === c.id);
                return (
                  <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                    <span className="truncate">
                      {meta?.name} · {meta?.label}
                    </span>
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th key={h.id} scope="col" aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined} className="h-10 px-3 text-start text-xs font-medium whitespace-nowrap text-muted-foreground">
                      {h.column.getCanSort() ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex max-w-56 items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUpIcon className="size-3" aria-hidden /> : sorted === "desc" ? <ArrowDownIcon className="size-3" aria-hidden /> : null}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className={cn("border-t hover:bg-muted/40", r.original.excluded && "opacity-60")}>
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className="px-3 py-2 align-middle">
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">{t("showing", { from: total ? pageIndex * pageSize + 1 : 0, to: Math.min(total, (pageIndex + 1) * pageSize), total })}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            {t("prev")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            {t("next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
