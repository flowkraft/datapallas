"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { IconGripVertical as GripVertical } from "@/components/shared/Icons";
import type { WidgetDisplayConfig } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";
import { getFieldKind } from "@/lib/explore-data/field-utils";
import type { PivotDslOptions } from "@/lib/explore-data/dsl-sync/pivot-mapping";

/**
 * ============================================================================
 * 📖 LLM / AI ASSISTANTS — READ FIRST
 *
 *   bkend/server/src/main/java/com/flowkraft/reporting/dsl/common/
 *     DSLPrinciplesReadme.java
 *
 * Especially Principle 4: every UI gesture in this Display tab panel mutates
 * the canonical DSL Map at displayConfig.dslConfig — never the old structured
 * fields (pivotRows, pivotCols, etc., now removed).
 * ============================================================================
 */

const AGGREGATORS = ["Sum", "Count", "Average", "Min", "Max"];

type ZoneId = "rows" | "cols" | "vals" | "available";
const DIM_ZONES: ZoneId[] = ["rows", "cols", "available"];
const MEASURE_ZONES: ZoneId[] = ["vals", "available"];

type AxisOrder = "ascending" | "descending";

interface PivotConfigProps {
  config: WidgetDisplayConfig;
  columns: ColumnSchema[];
  onChange: (config: WidgetDisplayConfig) => void;
}

function readDslMap(config: WidgetDisplayConfig): PivotDslOptions {
  return (config.dslConfig as PivotDslOptions) ?? {};
}

function setDslMap(
  config: WidgetDisplayConfig,
  next: PivotDslOptions,
  onChange: (c: WidgetDisplayConfig) => void,
): void {
  onChange({ ...config, dslConfig: next });
}

/** rowOrder/colOrder → "ascending" | "descending" | undefined */
function axisDir(order: unknown): AxisOrder | undefined {
  if (typeof order !== "string") return undefined;
  if (order.includes("z_to_a")) return "descending";
  if (order.includes("a_to_z")) return "ascending";
  return undefined;
}

export function PivotConfig({ config, columns, onChange }: PivotConfigProps) {
  const map = readDslMap(config);

  const rows = (map.rows as string[] | undefined) ?? [];
  const cols = (map.cols as string[] | undefined) ?? [];
  const vals = (map.vals as string[] | undefined) ?? [];
  const aggregator = (map.aggregatorName as string | undefined) ?? "Sum";
  const rowOrderDir = axisDir(map.rowOrder);
  const colOrderDir = axisDir(map.colOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const columnByName = useMemo(() => {
    const out: Record<string, ColumnSchema> = {};
    for (const c of columns) out[c.columnName] = c;
    return out;
  }, [columns]);

  const assigned = new Set([...rows, ...cols, ...vals]);
  const available = columns.filter((c) => !assigned.has(c.columnName));

  const zoneOf = (field: string): ZoneId => {
    if (rows.includes(field)) return "rows";
    if (cols.includes(field)) return "cols";
    if (vals.includes(field)) return "vals";
    return "available";
  };

  const isDropAllowed = (field: string, target: ZoneId): boolean => {
    if (target === "available") return true;
    const col = columnByName[field];
    const kind = col ? getFieldKind(col) : "dimension";
    return kind === "measure" ? MEASURE_ZONES.includes(target) : DIM_ZONES.includes(target);
  };

  const moveTo = (field: string, target: ZoneId) => {
    const nextRows = rows.filter((f) => f !== field);
    const nextCols = cols.filter((f) => f !== field);
    const nextVals = vals.filter((f) => f !== field);
    if (target === "rows") nextRows.push(field);
    else if (target === "cols") nextCols.push(field);
    else if (target === "vals") nextVals.push(field);

    const next: PivotDslOptions = { ...map };
    if (nextRows.length > 0) next.rows = nextRows; else delete next.rows;
    if (nextCols.length > 0) next.cols = nextCols; else delete next.cols;
    if (nextVals.length > 0) next.vals = nextVals; else delete next.vals;
    setDslMap(config, next, onChange);
  };

  const cycleRowOrder = () => {
    const next: PivotDslOptions = { ...map };
    if (rowOrderDir === "ascending") next.rowOrder = "key_z_to_a";
    else if (rowOrderDir === "descending") delete next.rowOrder;
    else next.rowOrder = "key_a_to_z";
    setDslMap(config, next, onChange);
  };

  const cycleColOrder = () => {
    const next: PivotDslOptions = { ...map };
    if (colOrderDir === "ascending") next.colOrder = "key_z_to_a";
    else if (colOrderDir === "descending") delete next.colOrder;
    else next.colOrder = "key_a_to_z";
    setDslMap(config, next, onChange);
  };

  const setAggregator = (agg: string) => {
    setDslMap(config, { ...map, aggregatorName: agg }, onChange);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const field = String(e.active.id);
    const overId = e.over?.id ? (String(e.over.id) as ZoneId) : null;
    if (!overId) return;
    if (!isDropAllowed(field, overId)) return;
    if (zoneOf(field) === overId) return;
    moveTo(field, overId);
  };

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const activeField = activeId;
  const activeKind = activeField ? (columnByName[activeField] ? getFieldKind(columnByName[activeField]) : "dimension") : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div id="configPanel-pivot" className="space-y-3">
        <FieldZone
          zoneId="rows"
          label="Rows"
          accept="dimension"
          fields={rows}
          columnByName={columnByName}
          onRemove={(f) => moveTo(f, "available")}
          axisDir={rowOrderDir}
          onCycleAxis={cycleRowOrder}
          isDropForbidden={activeKind === "measure"}
        />
        <FieldZone
          zoneId="cols"
          label="Columns"
          accept="dimension"
          fields={cols}
          columnByName={columnByName}
          onRemove={(f) => moveTo(f, "available")}
          axisDir={colOrderDir}
          onCycleAxis={cycleColOrder}
          isDropForbidden={activeKind === "measure"}
        />
        <FieldZone
          zoneId="vals"
          label="Values"
          accept="measure"
          fields={vals}
          columnByName={columnByName}
          onRemove={(f) => moveTo(f, "available")}
          isDropForbidden={activeKind === "dimension"}
        />

        <div>
          <span className="text-xs text-base-content/60">Aggregation</span>
          <select
            value={aggregator}
            onChange={(e) => setAggregator(e.target.value)}
            className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
          >
            {AGGREGATORS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <AvailableZone fields={available} />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeField && columnByName[activeField] ? (
          <FieldChip field={activeField} columnByName={columnByName} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function FieldZone({
  zoneId,
  label,
  accept,
  fields,
  columnByName,
  onRemove,
  axisDir,
  onCycleAxis,
  isDropForbidden,
}: {
  zoneId: "rows" | "cols" | "vals";
  label: string;
  accept: "dimension" | "measure";
  fields: string[];
  columnByName: Record<string, ColumnSchema>;
  onRemove: (f: string) => void;
  axisDir?: AxisOrder;
  onCycleAxis?: () => void;
  isDropForbidden?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zoneId });
  const showSort = zoneId === "rows" || zoneId === "cols";
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-base-content/60 flex items-center gap-1">
          {label}
          <span className="text-[9px] text-base-content/40">({accept}s)</span>
        </span>
        {showSort && fields.length > 0 && onCycleAxis && (
          <AxisSortToggle order={axisDir} onClick={onCycleAxis} />
        )}
      </div>
      <div
        ref={setNodeRef}
        className={[
          "mt-1 min-h-[36px] border border-dashed rounded-md p-1.5 flex flex-wrap gap-1 transition-colors",
          isOver && !isDropForbidden ? "border-primary bg-primary/5" : "border-base-300",
          isOver && isDropForbidden ? "border-error/50 bg-error/5 cursor-not-allowed" : "",
        ].join(" ")}
      >
        {fields.length === 0 && (
          <span className="text-[10px] text-base-content/30 px-1 py-0.5 self-center">
            Drag {accept}s here
          </span>
        )}
        {fields.map((f) => (
          <DraggableChip
            key={f}
            field={f}
            columnByName={columnByName}
            onRemove={() => onRemove(f)}
          />
        ))}
      </div>
    </div>
  );
}

function AvailableZone({ fields }: { fields: ColumnSchema[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "available" });
  return (
    <div>
      <span className="text-xs text-base-content/60">Available fields</span>
      <div
        ref={setNodeRef}
        className={[
          "mt-1 min-h-[36px] border border-dashed rounded-md p-1.5 flex flex-wrap gap-1 transition-colors",
          isOver ? "border-primary bg-primary/5" : "border-base-300/60 bg-base-200/20",
        ].join(" ")}
      >
        {fields.length === 0 && (
          <span className="text-[10px] text-base-content/30 px-1 py-0.5 self-center">
            All fields assigned — drag one back here to remove it.
          </span>
        )}
        {fields.map((c) => (
          <DraggableSourceChip key={c.columnName} col={c} />
        ))}
      </div>
    </div>
  );
}

function DraggableChip({
  field,
  columnByName,
  onRemove,
}: {
  field: string;
  columnByName: Record<string, ColumnSchema>;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: field });
  return (
    <span
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={chipClass(columnByName[field])}
    >
      <button
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing flex items-center text-base-content/60 hover:text-base-content"
        aria-label={`Drag ${field}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-2.5 h-2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" /></svg>
      </button>
      <span className="font-mono text-[10px]">{field}</span>
      <button id={`btnRemovePivotField-${field}`} onClick={onRemove} className="hover:text-error text-base-content/60" aria-label={`Remove ${field}`}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-2.5 h-2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </span>
  );
}

function DraggableSourceChip({ col }: { col: ColumnSchema }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: col.columnName });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={`cursor-grab active:cursor-grabbing ${chipClass(col)}`}
      title={`Drag to assign`}
    >
      <GripVertical className="w-2.5 h-2.5" />
      <span className="font-mono text-[10px]">{col.columnName}</span>
    </button>
  );
}

function FieldChip({
  field,
  columnByName,
}: {
  field: string;
  columnByName: Record<string, ColumnSchema>;
}) {
  return (
    <span className={`${chipClass(columnByName[field])} shadow-lg ring-1 ring-primary/40`}>
      <GripVertical className="w-2.5 h-2.5" />
      <span className="font-mono text-[10px]">{field}</span>
    </span>
  );
}

function AxisSortToggle({ order, onClick }: { order?: AxisOrder; onClick: () => void }) {
  const label = order === "ascending" ? "Sort A→Z"
              : order === "descending" ? "Sort Z→A"
              : "Default order (click to sort A→Z)";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 transition-colors ${
        order ? "text-primary" : "text-base-content/30 hover:text-base-content/60"
      }`}
      title={label}
      aria-label={label}
    >
      {order === "ascending"
        ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-2.5 h-2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" /></svg>
        : order === "descending"
        ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-2.5 h-2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" /></svg>
        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-2.5 h-2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" /></svg>
      }
      <span>{order === "ascending" ? "A→Z" : order === "descending" ? "Z→A" : "—"}</span>
    </button>
  );
}

function chipClass(col?: ColumnSchema): string {
  const kind = col ? getFieldKind(col) : "dimension";
  const base = "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border select-none";
  return kind === "measure"
    ? `${base} bg-emerald-500/10 border-emerald-500/20 text-emerald-700`
    : `${base} bg-blue-500/10 border-blue-500/20 text-blue-700`;
}
