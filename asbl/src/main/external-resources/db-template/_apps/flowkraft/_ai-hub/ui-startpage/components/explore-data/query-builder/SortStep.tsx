"use client";

// lucide-react removed
import type { ColumnSchema } from "@/lib/explore-data/types";

interface SortItem {
  column: string;
  direction: "ASC" | "DESC";
}

interface SortStepProps {
  columns: ColumnSchema[];
  sort: SortItem[];
  onChange: (sort: SortItem[]) => void;
}

export function SortStep({ columns, sort, onChange }: SortStepProps) {
  const addSort = () => {
    onChange([...sort, { column: columns[0]?.columnName || "", direction: "ASC" }]);
  };

  const updateSort = (i: number, patch: Partial<SortItem>) => {
    const updated = sort.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange(updated);
  };

  const removeSort = (i: number) => {
    onChange(sort.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-violet-500 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" /></svg>
        <span className="text-xs text-base-content/60">Sort</span>
        <button id="btnAddSort" onClick={addSort} className="p-0.5 rounded hover:bg-base-200 text-base-content/60 hover:text-base-content">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        </button>
      </div>

      {sort.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5 ml-6">
          <select
            id={`selectSortCol-${i}`}
            value={s.column}
            onChange={(e) => updateSort(i, { column: e.target.value })}
            className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content min-w-0 flex-1"
          >
            {columns.map((c) => (
              <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
            ))}
          </select>
          <select
            id={`selectSortDir-${i}`}
            value={s.direction}
            onChange={(e) => updateSort(i, { direction: e.target.value as "ASC" | "DESC" })}
            className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content w-16"
          >
            <option value="ASC">ASC</option>
            <option value="DESC">DESC</option>
          </select>
          <button id={`btnRemoveSort-${i}`} onClick={() => removeSort(i)} className="p-0.5 rounded hover:bg-error/10 text-base-content/60 hover:text-error">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
