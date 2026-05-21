"use client";

import { useState } from "react";
// lucide-react removed
import type { TableSchema } from "@/lib/explore-data/types";
import type { CubeInfo } from "@/lib/explore-data/rb-api";
import { getFieldKind } from "@/lib/explore-data/field-utils";
import { getColumnIcon, getColumnIconLabel } from "@/lib/explore-data/column-icons";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface DataStepProps {
  tables: TableSchema[];
  cubes?: CubeInfo[];
  // The currently-selected value: either a table name or a cube id
  value: string;
  valueKind: "table" | "cube";
  onPickTable: (table: string) => void;
  onPickCube: (cubeId: string) => void;
}

// cmdk uses a single string namespace for `value`. To avoid collisions
// between table names and cube ids (and to let the search filter both),
// we prefix entries: "tbl:Customers", "cube:northwind-sales".
const TABLE_PREFIX = "tbl:";
const CUBE_PREFIX = "cube:";

export function DataStep({ tables, cubes = [], value, valueKind, onPickTable, onPickCube }: DataStepProps) {
  const [open, setOpen] = useState(false);

  const selectedTable = valueKind === "table" ? tables.find((t) => t.tableName === value) : undefined;
  const selectedCube = valueKind === "cube" ? cubes.find((c) => c.id === value) : undefined;

  const triggerLabel = selectedTable
    ? `${selectedTable.tableName} (${selectedTable.columns.length} cols)`
    : selectedCube
    ? `${selectedCube.name} (cube)`
    : cubes.length > 0
    ? "Pick a table or cube..."
    : "Pick a table...";

  const triggerIconClass = selectedCube ? "text-amber-500" : "text-emerald-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {selectedCube
          ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={cn("w-4 h-4 shrink-0", triggerIconClass)}><path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
          : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={cn("w-4 h-4 shrink-0", triggerIconClass)}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h1.5m-1.5 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h17.25m-17.25 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125" /></svg>
        }
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              id="btnPickTableOrCube"
              type="button"
              role="combobox"
              aria-expanded={open}
              className="flex-1 flex items-center justify-between text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content hover:bg-base-200/50 transition-colors"
            >
              <span className={cn("truncate", !selectedTable && !selectedCube && "text-base-content/60")}>
                {triggerLabel}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="ml-2 h-4 w-4 shrink-0 opacity-50"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" /></svg>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
          >
            <Command>
              <CommandInput placeholder={cubes.length > 0 ? "Search tables and cubes..." : "Search table..."} />
              <CommandList>
                <CommandEmpty>No match found.</CommandEmpty>

                <CommandGroup heading="Tables">
                  {tables.map((t) => {
                    const itemValue = `${TABLE_PREFIX}${t.tableName}`;
                    const isSelected = valueKind === "table" && value === t.tableName;
                    return (
                      <CommandItem
                        id={`itemPickTable-${t.tableName}`}
                        key={itemValue}
                        value={itemValue}
                        keywords={[t.tableName]}
                        onSelect={() => {
                          onPickTable(t.tableName);
                          setOpen(false);
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="mr-2 h-3.5 w-3.5 text-emerald-500/70"><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h1.5m-1.5 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h17.25m-17.25 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125" /></svg>
                        <span className="flex-1 truncate">{t.tableName}</span>
                        <span className="ml-2 text-xs text-base-content/60">
                          ({t.columns.length} cols)
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>

                {cubes.length > 0 && (
                  <CommandGroup heading="Cubes">
                    {cubes.map((c) => {
                      const itemValue = `${CUBE_PREFIX}${c.id}`;
                      const isSelected = valueKind === "cube" && value === c.id;
                      return (
                        <CommandItem
                          id={`itemPickCube-${c.id}`}
                          key={itemValue}
                          value={itemValue}
                          keywords={[c.name, c.description, c.id]}
                          onSelect={() => {
                            onPickCube(c.id);
                            setOpen(false);
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="mr-2 h-3.5 w-3.5 text-amber-500/70"><path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{c.name}</div>
                            {c.description && (
                              <div className="text-[10px] text-base-content/60 truncate">
                                {c.description}
                              </div>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Column preview with Tableau-style color coding + semantic type icons
          (only for tables). Icon chosen by getColumnIcon — PK/FK/geographic/
          email/url/currency/percentage/etc. Hover title spells out the
          semantic type for a11y. */}
      {selectedTable && (
        <div className="ml-6 flex flex-wrap gap-1">
          {selectedTable.columns.map((col) => {
            const kind = getFieldKind(col);
            const Icon = getColumnIcon(col, selectedTable);
            const iconLabel = getColumnIconLabel(col, selectedTable);
            return (
              <span
                key={col.columnName}
                className={`text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                  kind === "measure"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                    : "bg-blue-500/10 border-blue-500/20 text-blue-600"
                }`}
                title={`${col.columnName} (${col.typeName}) — ${iconLabel}`}
              >
                <Icon className="w-3 h-3 shrink-0" aria-hidden />
                {col.columnName}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
