"use client";

// lucide-react removed
import type { ColumnSchema } from "@/lib/explore-data/types";
import type { ColumnSettings, NumberStyle } from "@/lib/explore-data/column-settings";
import { mergeColumnFormat } from "@/lib/explore-data/column-settings";
import {
  pickColumnFormat,
  formatCellText,
  type FormatKind,
  type CurrencyStyle,
  type DateUnit,
} from "@/lib/explore-data/type-formatters";

/** Every currency we offer in the picker. Ordered by likely usage frequency. */
const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "INR", name: "Indian Rupee" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "RUB", name: "Russian Ruble" },
  { code: "KRW", name: "Korean Won" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "ZAR", name: "South African Rand" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "BTC", name: "Bitcoin" },
  { code: "ETH", name: "Ethereum" },
];

const DATE_UNITS: { value: DateUnit | "auto"; label: string; group: "truncation" | "extraction" | "auto" }[] = [
  { value: "auto",             label: "Auto (from query)", group: "auto" },
  // Truncation — continuous timeline buckets
  { value: "year",             label: "Year (2026)",       group: "truncation" },
  { value: "quarter",          label: "Quarter (Q3 2026)", group: "truncation" },
  { value: "month",            label: "Month (Mar 2026)",  group: "truncation" },
  { value: "week",             label: "Week",              group: "truncation" },
  { value: "day",              label: "Day (Mar 15, 2026)",group: "truncation" },
  { value: "hour",             label: "Hour (15:00)",      group: "truncation" },
  { value: "minute",           label: "Minute",            group: "truncation" },
  // Extraction — discrete categories
  { value: "day-of-week",      label: "Day of week (Mon)", group: "extraction" },
  { value: "hour-of-day",      label: "Hour of day (14:00)", group: "extraction" },
  { value: "month-of-year",    label: "Month of year (March)", group: "extraction" },
  { value: "quarter-of-year",  label: "Quarter of year (Q3)", group: "extraction" },
];

const VIEW_AS_OPTIONS: { value: FormatKind | "auto"; label: string }[] = [
  { value: "auto",       label: "Auto (from column type)" },
  { value: "text",       label: "Plain text" },
  { value: "url",        label: "Clickable link" },
  { value: "email",      label: "Email (mailto:)" },
  { value: "image",      label: "Inline image" },
  { value: "currency",   label: "Currency" },
  { value: "percentage", label: "Percentage" },
  { value: "date",       label: "Date / time" },
  { value: "number",     label: "Number" },
  { value: "boolean",    label: "Yes / —" },
];

interface ColumnSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  column: ColumnSchema | null;
  settings: ColumnSettings | undefined;
  /** Called with the updated settings. Passing `undefined` resets the column. */
  onChange: (next: ColumnSettings | undefined) => void;
  /** One sample value used to preview the formatted output. */
  sampleValue?: unknown;
}

export function ColumnSettingsDialog({ open, onClose, column, settings, onChange, sampleValue }: ColumnSettingsDialogProps) {
  if (!open || !column) return null;

  const current = settings ?? {};
  const baseSpec = pickColumnFormat(column);
  const effectiveSpec = mergeColumnFormat(baseSpec, current);
  const effectiveKind = effectiveSpec.kind;
  const isNumberLike = effectiveKind === "currency" || effectiveKind === "percentage" || effectiveKind === "number";
  const isDateLike = effectiveKind === "date";

  // Immutable patch helper.
  const patch = (p: Partial<ColumnSettings>) => {
    const next = { ...current, ...p };
    // Strip undefined/empty to keep the stored shape tight.
    const cleaned: ColumnSettings = {};
    (Object.entries(next) as [keyof ColumnSettings, unknown][]).forEach(([k, v]) => {
      if (v !== undefined && v !== "" && v !== null) (cleaned as Record<string, unknown>)[k] = v;
    });
    onChange(Object.keys(cleaned).length === 0 ? undefined : cleaned);
  };

  // Live preview (rendered with current effective spec).
  let preview = "—";
  try {
    preview = sampleValue != null
      ? formatCellText(sampleValue, column, effectiveSpec) || "—"
      : formatCellText(
          effectiveKind === "currency" || effectiveKind === "percentage" || effectiveKind === "number" ? 1234.56
          : effectiveKind === "date" ? new Date()
          : "sample",
          column,
          effectiveSpec,
        );
  } catch { preview = "—"; }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-96 bg-base-100 border-l border-base-300 shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-300">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-base-content truncate">Column settings</h2>
            <p className="text-[11px] text-base-content/60 font-mono truncate">{column.columnName} <span className="text-base-content/60/60">({column.typeName})</span></p>
          </div>
          <button id="btnCloseColumnSettings" onClick={onClose} className="p-1 rounded-md text-base-content/60 hover:bg-base-200 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Live preview */}
          <div className="rounded-md bg-base-200/40 border border-base-300 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-base-content/60 mb-1">Preview</div>
            <div className="text-sm font-medium text-base-content break-all">{preview}</div>
          </div>

          {/* Display section — column title + view-as */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-base-content/60">Display</h3>

            <label className="block">
              <span className="text-xs text-base-content/60">Column title</span>
              <input
                type="text"
                value={current.columnTitle ?? ""}
                onChange={(e) => patch({ columnTitle: e.target.value || undefined })}
                placeholder={column.columnName}
                className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
              />
            </label>

            <label className="block">
              <span className="text-xs text-base-content/60">Display as</span>
              <select
                value={current.viewAs ?? "auto"}
                onChange={(e) => patch({ viewAs: e.target.value === "auto" ? undefined : (e.target.value as FormatKind) })}
                className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
              >
                {VIEW_AS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-base-content/60 mt-1">Default is inferred from column name + values. Pick a different kind to override.</p>
            </label>


          </section>

          {/* Number section */}
          {isNumberLike && (
            <section className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-base-content/60">Number</h3>

              <label className="block">
                <span className="text-xs text-base-content/60">Style</span>
                <select
                  value={current.numberStyle ?? (effectiveKind === "currency" ? "currency" : effectiveKind === "percentage" ? "percent" : "decimal")}
                  onChange={(e) => patch({ numberStyle: e.target.value as NumberStyle })}
                  className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
                >
                  <option value="decimal">Normal (1,234)</option>
                  <option value="currency">Currency ($1,234.56)</option>
                  <option value="percent">Percent (12.3%)</option>
                  <option value="scientific">Scientific (1.2e+3)</option>
                </select>
              </label>

              {effectiveKind === "currency" && (
                <>
                  <label className="block">
                    <span className="text-xs text-base-content/60">Unit of currency</span>
                    <select
                      value={effectiveSpec.currency ?? "USD"}
                      onChange={(e) => patch({ currency: e.target.value })}
                      className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-base-content/60">Currency label style</span>
                    <select
                      value={effectiveSpec.currencyStyle ?? "symbol"}
                      onChange={(e) => patch({ currencyStyle: e.target.value as CurrencyStyle })}
                      className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
                    >
                      <option value="symbol">Symbol ($10)</option>
                      <option value="code">Code (USD 10)</option>
                      <option value="name">Name (10 US dollars)</option>
                    </select>
                  </label>
                </>
              )}

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs text-base-content/60">Decimals</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={current.decimals ?? ""}
                    onChange={(e) => patch({ decimals: e.target.value === "" ? undefined : Number(e.target.value) })}
                    placeholder="auto"
                    className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-base-content/60">Scale ×</span>
                  <input
                    type="number"
                    step="any"
                    value={current.scale ?? ""}
                    onChange={(e) => patch({ scale: e.target.value === "" ? undefined : Number(e.target.value) })}
                    placeholder="1"
                    className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs text-base-content/60">Prefix</span>
                  <input
                    type="text"
                    value={current.prefix ?? ""}
                    onChange={(e) => patch({ prefix: e.target.value || undefined })}
                    placeholder="—"
                    className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-base-content/60">Suffix</span>
                  <input
                    type="text"
                    value={current.suffix ?? ""}
                    onChange={(e) => patch({ suffix: e.target.value || undefined })}
                    placeholder="—"
                    className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={current.compact === true}
                  onChange={(e) => patch({ compact: e.target.checked || undefined })}
                />
                <span className="text-xs text-base-content/60">Compact notation (1.2K, 3.4M)</span>
              </label>
            </section>
          )}

          {/* Date section */}
          {isDateLike && (
            <section className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-base-content/60">Date</h3>

              <label className="block">
                <span className="text-xs text-base-content/60">Granularity</span>
                <select
                  value={current.dateUnit ?? "auto"}
                  onChange={(e) => patch({ dateUnit: e.target.value === "auto" ? undefined : (e.target.value as DateUnit) })}
                  className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
                >
                  <optgroup label="Auto">
                    <option value="auto">Auto (from query)</option>
                  </optgroup>
                  <optgroup label="Truncation (timeline)">
                    {DATE_UNITS.filter((u) => u.group === "truncation").map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Extraction (discrete)">
                    {DATE_UNITS.filter((u) => u.group === "extraction").map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </optgroup>
                </select>
                <p className="text-[10px] text-base-content/60 mt-1">
                  "Auto" respects the group-by bucket you set in the Data tab. Override here if you want a different display granularity.
                </p>
              </label>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-base-300">
          <button
            id="btnResetColumnSettings"
            onClick={() => onChange(undefined)}
            disabled={!settings}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-base-content/60 hover:bg-base-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
            Reset to defaults
          </button>
          <button id="btnDoneColumnSettings" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors">
            Done
          </button>
        </div>
      </div>
    </>
  );
}
