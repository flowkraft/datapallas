"use client";

// lucide-react removed
import type { WidgetDisplayConfig } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";
import type { PickShape } from "@/lib/explore-data/smart-defaults/widget-picker";
import { dimensionsOf, measuresOf } from "@/lib/explore-data/widget-defaults";
import { AutoBadge, isAutoField, clearAutoFlag } from "./AutoBadge";

const _MapIcon  = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" /></svg>);
const _Globe    = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>);
const _MapPin   = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>);
const _Grid3x3  = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>);

const MAP_TYPES = [
  { type: "auto",   icon: _MapIcon, label: "Auto" },
  { type: "region", icon: _Globe,   label: "Region" },
  { type: "pin",    icon: _MapPin,  label: "Pins" },
  { type: "grid",   icon: _Grid3x3, label: "Grid" },
];

const REGIONS = [
  { value: "auto",             label: "Auto-detect" },
  { value: "world_countries",  label: "World countries" },
  { value: "us_states",        label: "US states" },
];

interface MapConfigProps {
  config: WidgetDisplayConfig;
  columns: ColumnSchema[];
  /** Pre-classified dims/measures view from the widget record.  MapConfig
   *  reads its dropdown contents from this shape (via `dimensionsOf` /
   *  `measuresOf`) instead of re-filtering `columns` by `getFieldKind` at
   *  every render — keeping us aligned with the "one computation, one
   *  cache, everyone reads the same view" rule.  Nullable so we gracefully
   *  handle the pre-query / pre-schema-fetch state. */
  shape: PickShape | null;
  onChange: (config: WidgetDisplayConfig) => void;
}

export function MapConfig({ config, columns, shape, onChange }: MapConfigProps) {
  const mapType  = (config.mapType  as string) || "auto";
  const region   = (config.region   as string) || "auto";
  const dimension = (config.dimension as string) || "";
  const metric    = (config.metric    as string) || "";
  const latField  = (config.latField  as string) || "";
  const lonField  = (config.lonField  as string) || "";

  const dimensions = dimensionsOf(columns, shape);
  const measures   = measuresOf(columns, shape);

  const showRegionFields = mapType === "region" || mapType === "auto";
  const showLatLonFields = mapType === "pin" || mapType === "grid" || mapType === "auto";

  return (
    <div id="configPanel-map" className="space-y-3">
      {/* Map type picker */}
      <div>
        <span className="text-xs text-base-content/60">
          Map type
          {isAutoField(config, "mapType") && (
            <AutoBadge reason="Picked from data shape (state/country → region; lat+lon → pins; binned lat+lon → grid)." />
          )}
        </span>
        <div className="flex gap-1 mt-1">
          {MAP_TYPES.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              id={`btnMapType-${type}`}
              aria-pressed={mapType === type}
              onClick={() => onChange(clearAutoFlag({ ...config, mapType: type }, "mapType"))}
              className={`flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-md text-[11px] transition-colors ${
                mapType === type
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "text-base-content/60 hover:bg-base-200 border border-transparent"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Region picker — only when region / auto */}
      {showRegionFields && (
        <div>
          <span className="text-xs text-base-content/60">Region</span>
          <select
            value={region}
            onChange={(e) => onChange(clearAutoFlag({ ...config, region: e.target.value }, "region"))}
            className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Dimension — only when region / auto */}
      {showRegionFields && (
        <div>
          <span className="text-xs text-base-content/60">
            Location <span className="text-blue-500">(dimension)</span>
            {isAutoField(config, "dimension") && (
              <AutoBadge reason="Picked from the first non-numeric, non-ID column (looks like country/state names)." />
            )}
          </span>
          <select
            value={dimension}
            onChange={(e) => onChange(clearAutoFlag({ ...config, dimension: e.target.value }, "dimension"))}
            className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
          >
            <option value="">Auto-detect</option>
            {dimensions.map((c) => (
              <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
            ))}
          </select>
        </div>
      )}

      {/* Lat / Lon — only when pin / grid / auto */}
      {showLatLonFields && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-xs text-base-content/60">Latitude</span>
            <select
              value={latField}
              onChange={(e) => onChange({ ...config, latField: e.target.value })}
              className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
            >
              <option value="">Auto-detect</option>
              {measures.map((c) => (
                <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-xs text-base-content/60">Longitude</span>
            <select
              value={lonField}
              onChange={(e) => onChange({ ...config, lonField: e.target.value })}
              className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
            >
              <option value="">Auto-detect</option>
              {measures.map((c) => (
                <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Metric — always relevant (drives color intensity in region/grid, popup data in pin) */}
      <div>
        <span className="text-xs text-base-content/60">
          Metric <span className="text-emerald-500">(measure)</span>
          {isAutoField(config, "metric") && (
            <AutoBadge reason="First numeric column (ID columns excluded)." />
          )}
        </span>
        <select
          value={metric}
          onChange={(e) => onChange(clearAutoFlag({ ...config, metric: e.target.value }, "metric"))}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          <option value="">Auto-detect</option>
          {measures.map((c) => (
            <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
