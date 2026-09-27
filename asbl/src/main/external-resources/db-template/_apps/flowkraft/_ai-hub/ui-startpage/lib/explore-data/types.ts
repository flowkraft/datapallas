// Java backend response types

export interface SchemaInfo {
  notes: string | null;
  /** The schema an unqualified table name resolves to on this connection, from
   *  the Java `SchemaInfo.defaultSchema`. A table reference is qualified only
   *  when the table's own `schemaName` differs from this, so `main`, `public`
   *  and `dbo` tables keep exactly the SQL and the element ids they had before
   *  schemas were reported. Absent on a backend that predates that field. */
  defaultSchema?: string | null;
  tables: TableSchema[];
}

/** Mirrors Java `ForeignKeySchema` DTO. */
export interface ForeignKeySchema {
  fkName?: string;
  fkColumnName: string;
  pkTableName?: string;
  pkColumnName?: string;
}

export interface TableSchema {
  tableName: string;
  /** The schema the table lives in, from the Java `TableSchema.schemaName`
   *  (TABLE_SCHEM in the JDBC catalog) — "main" or "cube_demo" on DuckDB,
   *  "public" on PostgreSQL, "dbo" on SQL Server, absent where the vendor has
   *  no schema concept. Two tables of the same name in two schemas are told
   *  apart by this; see `findTable` in `table-ref.ts`. */
  schemaName?: string | null;
  tableType: "TABLE" | "VIEW";
  columns: ColumnSchema[];
  primaryKeyColumns: string[];
  /** Foreign-key metadata from the backend DTO — when present, `isIdColumn`
   *  uses `fkColumnName` entries as authoritative FK hints, catching cases
   *  where the name doesn't match the `/id|code|key$/i` pattern (e.g.,
   *  `ShipVia` in Orders → FK to `Shippers`). */
  foreignKeys?: ForeignKeySchema[];
}

export interface ColumnSchema {
  columnName: string;
  typeName: string;
  isNullable: boolean;
  /** Optional semantic-type hint, set by the value-fingerprint probe in
   *  `probeSemanticType`. When present, predicates like `isEmail`/`isURL`/
   *  `isState`/`isJson` consult this first — it catches columns whose names
   *  don't match our regexes but whose values clearly belong to a known type
   *  (e.g., a `contact` column holding all emails). Populated by fingerprinting
   *  a sample of rows against per-type value matchers. */
  semanticHint?: SemanticHint;
}

export type SemanticHint =
  | "email" | "url" | "image_url" | "avatar_url"
  | "state" | "country" | "city" | "zip_code"
  | "latitude" | "longitude"
  | "currency" | "percentage"
  | "json";

export interface ConnectionInfo {
  connectionCode: string;
  connectionName: string;
  defaultConnection?: boolean;
  dbserver: { type: string; database: string };
}

export interface QueryResult {
  data: Record<string, unknown>[];
  rowCount: number;
}
