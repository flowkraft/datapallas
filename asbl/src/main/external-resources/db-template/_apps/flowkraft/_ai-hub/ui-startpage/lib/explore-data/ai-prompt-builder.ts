/**
 * Builds a fully-prepared AI prompt for the explore-data "Hey AI, Help Me..." button.
 *
 * Fetches the right prompt template from the Spring Boot REST API
 * (GET /api/ai/prompts/{id}), fills in all placeholders with real
 * context (DB vendor, table schema JSON or cube DSL), and returns
 * the ready-to-copy string.
 *
 * The user pastes this into ChatGPT / Claude / any AI → gets back
 * SQL or Groovy script → pastes it into the editor.
 *
 * No LLM calls are made here — this is purely a prompt builder.
 */

import { fetchCube } from "./rb-api";
import type { SchemaInfo, ColumnSchema } from "./types";

export type AiMode = "sql" | "script";
export type AiKind = "table" | "cube";

const RB_BASE = process.env.NEXT_PUBLIC_RB_API_URL || "http://localhost:9090/api";

// ── Prompt ID selection ───────────────────────────────────────────────────────

const PROMPT_IDS: Record<AiMode, Record<AiKind, string>> = {
  sql:    { table: "SQL_FROM_NATURAL_LANGUAGE", cube: "SQL_FROM_CUBE_DSL" },
  script: { table: "GROOVY_SCRIPT_INPUT_SOURCE", cube: "GROOVY_SCRIPT_FROM_CUBE_DSL" },
};

// ── Template fetching ─────────────────────────────────────────────────────────

async function fetchTemplate(promptId: string): Promise<string> {
  const res = await fetch(`${RB_BASE}/system/ai-prompts/${encodeURIComponent(promptId)}`);
  if (!res.ok) throw new Error(`Prompt template "${promptId}" not found (HTTP ${res.status})`);
  const data = await res.json();
  return data.promptText || "";
}

// ── Schema formatting ─────────────────────────────────────────────────────────

function formatSchemaForTable(schema: SchemaInfo, tableName: string): string {
  const table = schema.tables.find((t) => t.tableName === tableName);
  if (!table) return `-- Table "${tableName}" not found in schema`;
  return JSON.stringify(
    [
      {
        tableName: table.tableName,
        columns: table.columns.map((c) => ({
          name: c.columnName,
          dataType: c.typeName,
          ...(c.isNullable === false ? { isNullable: false } : {}),
        })),
      },
    ],
    null,
    2
  );
}

/** Format multiple tables' schema as JSON — same structure as formatSchemaForTable but for N tables. */
function formatSchemaForTables(schema: SchemaInfo, tableNames: string[]): string {
  const tables = tableNames
    .map((name) => schema.tables.find((t) => t.tableName === name))
    .filter(Boolean);
  if (tables.length === 0) return "-- No tables found in schema";
  return JSON.stringify(
    tables.map((table) => ({
      tableName: table!.tableName,
      columns: table!.columns.map((c) => ({
        name: c.columnName,
        dataType: c.typeName,
        ...(c.isNullable === false ? { isNullable: false } : {}),
      })),
    })),
    null,
    2
  );
}

// ── Main builder ──────────────────────────────────────────────────────────────

export interface BuildPromptOptions {
  mode: AiMode;
  kind: AiKind;
  requirement: string;       // user's natural language description
  connectionType: string;    // DB vendor, e.g. "sqlite", "postgresql"
  schema?: SchemaInfo;       // needed when kind === "table"
  tableName?: string;        // needed when kind === "table"
  cubeId?: string;           // needed when kind === "cube"
  additionalTableNames?: string[]; // extra tables selected via "Pick more tables"
}

// ── DSL builder ───────────────────────────────────────────────────────────────

const DSL_PROMPT_IDS: Record<string, string> = {
  tabulator:     "TABULATOR_DSL_CONFIGURE",
  chart:         "CHART_DSL_CONFIGURE",
  pivot:         "PIVOT_TABLE_DSL_CONFIGURE",
  "filter-pane": "FILTER_PANE_DSL_CONFIGURE",
  "filter-bar":  "REPORT_PARAMS_DSL_CONFIGURE",
};

export interface BuildDslPromptOptions {
  componentType: string;                    // "tabulator" | "chart" | "pivot" | "filter-pane"
  requirement: string;                      // user's natural language description
  columns: ColumnSchema[];
  sampleData: Record<string, unknown>[];
  currentDsl: string;
}

/**
 * Extract the Groovy DSL example from a fetched prompt template.
 * All *DslConfigure.java files wrap their example in <EXAMPLE_DSL>...</EXAMPLE_DSL>
 * tags, so the "Show Example" dialog stays in lockstep with what the AI sees.
 */
export function extractExampleDsl(template: string): string {
  const m = template.match(/<EXAMPLE_DSL>\s*([\s\S]*?)\s*<\/EXAMPLE_DSL>/);
  return m ? m[1] : "";
}

export async function fetchDslExample(componentType: string): Promise<string> {
  const promptId = DSL_PROMPT_IDS[componentType];
  if (!promptId) return "";
  const template = await fetchTemplate(promptId);
  return extractExampleDsl(template);
}

export async function buildDslAiPrompt(opts: BuildDslPromptOptions): Promise<string> {
  const { componentType, requirement, columns, sampleData, currentDsl } = opts;

  const promptId = DSL_PROMPT_IDS[componentType];
  if (!promptId) throw new Error(`No DSL prompt for component type: ${componentType}`);

  let template = await fetchTemplate(promptId);

  template = template.replace(
    /\[INSERT USER'S NATURAL LANGUAGE DESCRIPTION OF THE (?:TABLE|CHART|PIVOT TABLE|FILTER PANE|REPORT) HERE\]/g,
    requirement
  );
  template = template.replace(
    /\[INSERT COLUMN NAMES HERE\]/g,
    columns.length ? columns.map((c) => c.columnName).join(", ") : "INFORMATION_NOT_AVAILABLE"
  );
  template = template.replace(
    /\[INSERT SAMPLE DATA HERE\]/g,
    sampleData.length ? JSON.stringify(sampleData.slice(0, 5), null, 2) : "INFORMATION_NOT_AVAILABLE"
  );
  template = template.replace(
    /\[INSERT SCRIPT HERE\]/g,
    currentDsl.trim() || "NO DSL CONFIGURED YET"
  );

  return template;
}

// ── SQL/Script builder ────────────────────────────────────────────────────────

export async function buildAiPrompt(opts: BuildPromptOptions): Promise<string> {
  const { mode, kind, requirement, connectionType, schema, tableName, cubeId, additionalTableNames } = opts;

  const promptId = PROMPT_IDS[mode][kind];
  let template = await fetchTemplate(promptId);

  // 1. Fill in the user's requirement (inside <REQUIREMENT>...</REQUIREMENT>)
  template = template.replace(
    /\[INSERT USER'S NATURAL LANGUAGE QUESTION OR INSTRUCTION FOR THE SQL QUERY HERE\]/g,
    requirement
  );

  // 2. Fill in DB vendor
  template = template.replace(/\[DATABASE_VENDOR\]/g, connectionType || "SQL");

  // 3. Fill in schema or cube DSL
  if (kind === "table" && schema && tableName) {
    const allTableNames = [tableName, ...(additionalTableNames || [])].filter(Boolean);
    const schemaStr = allTableNames.length > 1
      ? formatSchemaForTables(schema, allTableNames)
      : formatSchemaForTable(schema, tableName);
    template = template.replace(/\[INSERT THE RELEVANT DATABASE SCHEMA HERE\]/g, schemaStr);
  } else if (kind === "cube" && cubeId) {
    const cube = await fetchCube(cubeId);
    template = template.replace(/\[INSERT THE RELEVANT CUBE DSL HERE\]/g, cube.dslCode);
  }

  return template;
}
