"use client";

// lucide-react removed
import type { ColumnSchema } from "@/lib/explore-data/types";
import { isParamRef } from "@/lib/explore-data/sql-builder";

interface FilterItem {
  column: string;
  operator: string;
  value: string;
  valueTo?: string;
}

// --- Type-aware operator groups ---

interface OperatorDef {
  value: string;
  label: string;
}

const STRING_OPS: OperatorDef[] = [
  { value: "equals", label: "=" },
  { value: "not_equals", label: "!=" },
  { value: "contains", label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "in", label: "in" },
  { value: "not_in", label: "not in" },
  { value: "is_null", label: "is null" },
  { value: "is_not_null", label: "is not null" },
];

const NUMBER_OPS: OperatorDef[] = [
  { value: "equals", label: "=" },
  { value: "not_equals", label: "!=" },
  { value: "greater_than", label: ">" },
  { value: "greater_or_equal", label: ">=" },
  { value: "less_than", label: "<" },
  { value: "less_or_equal", label: "<=" },
  { value: "between", label: "between" },
  { value: "in", label: "in" },
  { value: "not_in", label: "not in" },
  { value: "is_null", label: "is null" },
  { value: "is_not_null", label: "is not null" },
];

const DATE_OPS: OperatorDef[] = [
  { value: "equals", label: "=" },
  { value: "not_equals", label: "!=" },
  { value: "greater_than", label: "after" },
  { value: "greater_or_equal", label: "on or after" },
  { value: "less_than", label: "before" },
  { value: "less_or_equal", label: "on or before" },
  { value: "between", label: "between" },
  { value: "is_null", label: "is null" },
  { value: "is_not_null", label: "is not null" },
];

const BOOLEAN_OPS: OperatorDef[] = [
  { value: "equals", label: "=" },
  { value: "is_null", label: "is null" },
  { value: "is_not_null", label: "is not null" },
];

const NO_VALUE_OPS = ["is_null", "is_not_null"];

// Operators where a single ${paramName} placeholder makes sense in SQL.
// LIKE-family and `between` are excluded: LIKE needs the % wrapper (complex),
// between needs two values. `in` / `not_in` are bindable: the param value
// (CSV string like "1, 5, 10") is split into a real SQL list at the JDBI layer
// via bindList — see DatabaseHelper.convertToJdbiParameters / QueriesService.
const PARAM_BINDABLE_OPS = new Set([
  "equals", "not_equals",
  "greater_than", "greater_or_equal",
  "less_than", "less_or_equal",
  "in", "not_in",
]);

// Type detection from column schema
const NUMERIC_TYPES = new Set([
  "INTEGER", "INT", "BIGINT", "SMALLINT", "TINYINT",
  "FLOAT", "DOUBLE", "REAL", "DECIMAL", "NUMERIC",
  "NUMBER", "MONEY", "INT4", "INT8", "INT2",
  "FLOAT4", "FLOAT8", "HUGEINT", "UINTEGER", "UBIGINT",
]);

const DATE_TYPES = new Set([
  "DATE", "DATETIME", "TIMESTAMP", "TIMESTAMPTZ",
  "TIMESTAMP_TZ", "TIMESTAMP WITH TIME ZONE",
  "TIME", "TIMETZ", "INTERVAL",
]);

const BOOLEAN_TYPES = new Set(["BOOLEAN", "BOOL", "BIT"]);

function getColumnType(column: ColumnSchema): "string" | "number" | "date" | "boolean" {
  const type = (column.typeName || "").toUpperCase().split("(")[0].trim();
  if (NUMERIC_TYPES.has(type)) return "number";
  if (DATE_TYPES.has(type)) return "date";
  if (BOOLEAN_TYPES.has(type)) return "boolean";
  return "string";
}

function getOperatorsForColumn(column: ColumnSchema | undefined): OperatorDef[] {
  if (!column) return STRING_OPS;
  switch (getColumnType(column)) {
    case "number": return NUMBER_OPS;
    case "date": return DATE_OPS;
    case "boolean": return BOOLEAN_OPS;
    default: return STRING_OPS;
  }
}

interface FilterStepProps {
  columns: ColumnSchema[];
  filters: FilterItem[];
  onChange: (filters: FilterItem[]) => void;
  /** Parameter IDs defined in the canvas filterDsl — drives the "bind to param" toggle. */
  availableParams?: string[];
}

export function FilterStep({ columns, filters, onChange, availableParams = [] }: FilterStepProps) {
  const addFilter = () => {
    onChange([...filters, { column: columns[0]?.columnName || "", operator: "equals", value: "" }]);
  };

  const updateFilter = (i: number, patch: Partial<FilterItem>) => {
    const updated = filters.map((f, idx) => {
      if (idx !== i) return f;
      const next = { ...f, ...patch };
      // When column changes, reset operator if it's not valid for the new column type
      if (patch.column && patch.column !== f.column) {
        const col = columns.find((c) => c.columnName === patch.column);
        const validOps = getOperatorsForColumn(col);
        if (!validOps.some((op) => op.value === next.operator)) {
          next.operator = "equals";
        }
        next.value = "";
        next.valueTo = undefined;
      }
      // Clear valueTo when switching away from between
      if (patch.operator && patch.operator !== "between") {
        next.valueTo = undefined;
      }
      // Clear param binding when switching to an operator that doesn't support it
      if (patch.operator && !PARAM_BINDABLE_OPS.has(patch.operator) && isParamRef(next.value)) {
        next.value = "";
      }
      return next;
    });
    onChange(updated);
  };

  const removeFilter = (i: number) => {
    onChange(filters.filter((_, idx) => idx !== i));
  };

  const bindParam = (i: number, paramId: string) => {
    updateFilter(i, { value: `\${${paramId}}` });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-orange-500 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" /></svg>
        <span className="text-xs text-base-content/60">Filter</span>
        <button id="btnAddFilter" onClick={addFilter} className="p-0.5 rounded hover:bg-base-200 text-base-content/60 hover:text-base-content">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        </button>
      </div>

      {filters.map((f, i) => {
        const col = columns.find((c) => c.columnName === f.column);
        const ops = getOperatorsForColumn(col);
        const boundToParam = !NO_VALUE_OPS.includes(f.operator) && isParamRef(f.value);
        const canBind = availableParams.length > 0 && PARAM_BINDABLE_OPS.has(f.operator) && !boundToParam;

        return (
          <div key={i} className="flex items-center gap-1.5 ml-6">
            <select
              id={`selectFilterCol-${i}`}
              value={f.column}
              onChange={(e) => updateFilter(i, { column: e.target.value })}
              className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content min-w-0 flex-1"
            >
              {columns.map((c) => (
                <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
              ))}
            </select>

            <select
              id={`selectFilterOp-${i}`}
              value={f.operator}
              onChange={(e) => updateFilter(i, { operator: e.target.value })}
              className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content w-20"
            >
              {ops.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>

            {/* Value area */}
            {f.operator === "between" ? (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <input
                  value={f.value}
                  onChange={(e) => updateFilter(i, { value: e.target.value })}
                  placeholder="min"
                  className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content min-w-0 flex-1"
                />
                <span className="text-[10px] text-base-content/60 shrink-0">and</span>
                <input
                  value={f.valueTo || ""}
                  onChange={(e) => updateFilter(i, { valueTo: e.target.value })}
                  placeholder="max"
                  className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content min-w-0 flex-1"
                />
              </div>
            ) : !NO_VALUE_OPS.includes(f.operator) && (
              boundToParam ? (
                /* Param chip — shows the bound ${paramName} with a clear button */
                <div title={f.value} className="flex items-center gap-1 min-w-0 flex-1 bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">
                  <span className="text-xs font-mono text-primary truncate flex-1">{f.value}</span>
                  <button
                    type="button"
                    onClick={() => updateFilter(i, { value: "" })}
                    className="text-primary/50 hover:text-primary shrink-0"
                    title="Unbind parameter — use a literal value instead"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-2.5 h-2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    id={`inputFilterValue-${i}`}
                    value={f.value}
                    onChange={(e) => updateFilter(i, { value: e.target.value })}
                    placeholder={
                      f.operator === "in" || f.operator === "not_in"
                        ? "comma-separated: 1, 5, 10  or  PAID, PENDING"
                        : "value"
                    }
                    className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content min-w-0 flex-1"
                  />
                  {/* Param bind toggle — only shown when params exist and operator supports it */}
                  {canBind && (
                    availableParams.length === 1 ? (
                      <button
                        id={`btnBindParam-${i}`}
                        type="button"
                        title={`Bind to dashboard filter \${${availableParams[0]}}`}
                        onClick={() => bindParam(i, availableParams[0])}
                        className="text-[11px] font-mono text-base-content/60 hover:text-primary hover:bg-primary/10 px-1 py-0.5 rounded shrink-0 leading-none"
                      >
                        {'${}'}
                      </button>
                    ) : (
                      <select
                        id={`selectBindParam-${i}`}
                        value=""
                        onChange={(e) => { if (e.target.value) bindParam(i, e.target.value); }}
                        className="text-[11px] font-mono bg-base-100 border border-base-300 rounded px-1 py-0.5 text-base-content/60 hover:text-primary shrink-0"
                        title="Bind to a dashboard filter parameter"
                      >
                        <option value="">{'${}'}</option>
                        {availableParams.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    )
                  )}
                </>
              )
            )}

            <button id={`btnRemoveFilter-${i}`} onClick={() => removeFilter(i)} className="p-0.5 rounded hover:bg-error/10 text-base-content/60 hover:text-error">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
