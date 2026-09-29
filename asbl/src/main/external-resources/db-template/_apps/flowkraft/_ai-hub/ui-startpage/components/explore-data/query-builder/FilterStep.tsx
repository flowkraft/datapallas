"use client";

// lucide-react removed
import type { ColumnSchema } from "@/lib/explore-data/types";
import { bindableParams, columnClassOf, isParamRef, paramRefOf, type BindableParam } from "@/lib/explore-data/sql-builder";
// The operator lists live next to the generator (`lib/explore-data/filter-operators.ts`),
// so a test can walk every operator this step offers and check that the
// generator writes SQL for it. This step only picks the list for the column's
// kind, as it always did.
import {
  BOOLEAN_OPS,
  DATE_OPS,
  FILTER_MATCHES,
  NO_VALUE_OPS,
  NUMBER_OPS,
  PARAM_BINDABLE_OPS,
  RELATIVE_DATE_N_OPS,
  STRING_OPS,
  type FilterMatch,
  type OperatorDef,
} from "@/lib/explore-data/filter-operators";

interface FilterItem {
  column: string;
  operator: string;
  value: string;
  valueTo?: string;
}

// Type detection from column schema
/**
 * Which operators and which input control this column gets.
 *
 * The classification itself is `columnClassOf` in `sql-builder.ts`, the one
 * place a database type name is read: the operator list offered here and the
 * literal the generator writes have to come from the same answer. This step
 * only collapses it — a date, a timestamp and a time all get the date
 * operators, while the generator writes a time as a plain string because ANSI
 * has no portable time literal.
 */
function getColumnType(column: ColumnSchema): "string" | "number" | "date" | "boolean" {
  switch (columnClassOf(column)) {
    case "number":    return "number";
    case "date":
    case "timestamp":
    case "time":      return "date";
    case "boolean":   return "boolean";
    default:          return "string";
  }
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
  /** Whether a row has to pass all the filters or any one of them (F3). */
  match?: FilterMatch;
  onMatchChange?: (match: FilterMatch) => void;
  /** Parameter IDs defined in the canvas filterDsl — drives the "bind to param" toggle. */
  availableParams?: string[];
  /** The `dp_` names the server sets for whoever is looking, offered next to them (R9). The
   *  names come from the server itself (`fetchBuiltinParamNames`), never from a list here. */
  builtinParams?: string[];
}

export function FilterStep({ columns, filters, onChange, match = "all", onMatchChange, availableParams = [], builtinParams = [] }: FilterStepProps) {
  /** Everything a filter can be bound to: the dashboard's own first, the server's after them. */
  const offers = bindableParams(availableParams, builtinParams);

  /** What the chip says about one of them, so a builtin never reads as a dashboard filter. */
  const offerTitle = (offer: BindableParam) =>
    offer.fromServer
      ? `Bind to ${paramRefOf(offer.id)} — set by the server for whoever is looking`
      : `Bind to dashboard filter ${paramRefOf(offer.id)}`;

  /** The options of the bind dropdown: two groups, and the server's said to be the server's. */
  const offerOptions = () => {
    const declared = offers.filter((offer) => !offer.fromServer);
    const server = offers.filter((offer) => offer.fromServer);
    return (
      <>
        {declared.map((offer) => (
          <option key={offer.id} value={offer.id}>{offer.id}</option>
        ))}
        {server.length > 0 && (
          <optgroup label="Set by the server">
            {server.map((offer) => (
              <option key={offer.id} value={offer.id}>{offer.id}</option>
            ))}
          </optgroup>
        )}
      </>
    );
  };
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

  const bindParam = (i: number, paramId: string, field: "value" | "valueTo" = "value") => {
    updateFilter(i, { [field]: paramRefOf(paramId) });
  };

  /** One box of a `between` filter: the parameter it is bound to, or the input
   *  and the control that binds it. A date range on a dashboard is two Date
   *  parameters, one per box, so each box binds on its own; the single-value
   *  operators keep their own markup below. */
  const betweenBox = (i: number, field: "value" | "valueTo", value: string, placeholder: string) => {
    const id = field === "value" ? "" : "To";
    if (isParamRef(value)) {
      return (
        <div title={value} className="flex items-center gap-1 min-w-0 flex-1 bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">
          <span className="text-xs font-mono text-primary truncate flex-1">{value}</span>
          <button
            id={`btnUnbindFilterBetween${id}-${i}`}
            type="button"
            onClick={() => updateFilter(i, { [field]: "" })}
            className="text-primary/50 hover:text-primary shrink-0"
            title="Unbind parameter — use a literal value instead"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-2.5 h-2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      );
    }
    return (
      <>
        <input
          id={`inputFilterValue${id}-${i}`}
          value={value}
          onChange={(e) => updateFilter(i, { [field]: e.target.value })}
          placeholder={placeholder}
          className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content min-w-0 flex-1"
        />
        {offers.length > 0 && (
          offers.length === 1 ? (
            <button
              id={`btnBindParam${id}-${i}`}
              type="button"
              title={offerTitle(offers[0])}
              onClick={() => bindParam(i, offers[0].id, field)}
              className="text-[11px] font-mono text-base-content/60 hover:text-primary hover:bg-primary/10 px-1 py-0.5 rounded shrink-0 leading-none"
            >
              {'${}'}
            </button>
          ) : (
            <select
              id={`selectBindParam${id}-${i}`}
              value=""
              onChange={(e) => { if (e.target.value) bindParam(i, e.target.value, field); }}
              className="text-[11px] font-mono bg-base-100 border border-base-300 rounded px-1 py-0.5 text-base-content/60 hover:text-primary shrink-0"
              title="Bind to a dashboard filter, or to a value the server sets"
            >
              <option value="">{'${}'}</option>
              {offerOptions()}
            </select>
          )
        )}
      </>
    );
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-orange-500 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" /></svg>
        <span className="text-xs text-base-content/60">Filter</span>
        <button id="btnAddFilter" onClick={addFilter} className="p-0.5 rounded hover:bg-base-200 text-base-content/60 hover:text-base-content">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        </button>
        {/* One filter is one condition, so there is nothing to join and nothing
            to ask; the dropdown appears with the second one. */}
        {filters.length > 1 && (
          <>
            <span className="text-xs text-base-content/60">match</span>
            <select
              id="selectFilterMatch"
              value={match}
              onChange={(e) => onMatchChange?.(e.target.value as FilterMatch)}
              className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content"
            >
              {FILTER_MATCHES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {filters.map((f, i) => {
        const col = columns.find((c) => c.columnName === f.column);
        const ops = getOperatorsForColumn(col);
        const boundToParam = !NO_VALUE_OPS.includes(f.operator) && isParamRef(f.value);
        const canBind = offers.length > 0 && PARAM_BINDABLE_OPS.has(f.operator) && !boundToParam;

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
                {betweenBox(i, "value", f.value, "min")}
                <span className="text-[10px] text-base-content/60 shrink-0">and</span>
                {betweenBox(i, "valueTo", f.valueTo || "", "max")}
              </div>
            ) : !NO_VALUE_OPS.includes(f.operator) && (
              boundToParam ? (
                /* Param chip — shows the bound ${paramName} with a clear button */
                <div title={f.value} className="flex items-center gap-1 min-w-0 flex-1 bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">
                  <span className="text-xs font-mono text-primary truncate flex-1">{f.value}</span>
                  <button
                    id={`btnUnbindFilterValue-${i}`}
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
                        : RELATIVE_DATE_N_OPS.includes(f.operator)
                          ? "how many, e.g. 30"
                          : "value"
                    }
                    className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content min-w-0 flex-1"
                  />
                  {/* Param bind toggle — only shown when params exist and operator supports it */}
                  {canBind && (
                    offers.length === 1 ? (
                      <button
                        id={`btnBindParam-${i}`}
                        type="button"
                        title={offerTitle(offers[0])}
                        onClick={() => bindParam(i, offers[0].id)}
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
                        title="Bind to a dashboard filter, or to a value the server sets"
                      >
                        <option value="">{'${}'}</option>
                        {offerOptions()}
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
