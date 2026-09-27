// A table reference is a (schema, name) pair, and everything that keys on a
// table keys on the pair: the `schema.tables` lookup, the probe caches, the
// schema browser's element ids and the SQL the generator writes.
//
// A reference with no schema means "the connection's default schema" — what
// every table meant before the backend reported schemas at all. Its key is the
// bare table name, so a saved canvas keeps its SQL and a `btnTable-…` id keeps
// its spelling. Only a table in some OTHER schema carries one, and only then
// does anything about it change.
//
// Nothing here is vendor-specific: quoting a reference for a database is
// `quoteTableRef` in `sql-dialects.ts`, the vendor layer.

import type { SchemaInfo, TableSchema } from "./types";
import type { TableRef } from "./sql-dialects";

export type { TableRef };

/** Accept either spelling a caller has — a bare name, or the pair. */
export function asTableRef(table: TableRef | string, schema?: string | null): TableRef {
  if (typeof table !== "string") return table;
  return schema ? { schema, name: table } : { name: table };
}

/**
 * The cache / element-id key for a table. A table in the default schema keys on
 * its bare name, exactly as before; a table elsewhere keys on `schema.name`.
 *
 * This is a key, not SQL: it is never sent to a database, so it needs no
 * quoting and must never be built by hand anywhere else.
 */
export function tableKey(table: TableRef | string, schema?: string | null): string {
  const ref = asTableRef(table, schema);
  return ref.schema ? `${ref.schema}.${ref.name}` : ref.name;
}

/**
 * Find a table in a fetched schema.
 *
 * With a schema in the reference, both the name and the schema must match, so
 * `cube_demo.crm_deals` and `main.crm_deals` are two different tables with
 * their own columns. Without one, a table in the connection's default schema
 * wins; failing that, the first table of that name does, which is what every
 * single-schema connection has always resolved to.
 */
export function findTable(
  schema: SchemaInfo | TableSchema[],
  table: TableRef | string,
): TableSchema | undefined {
  const tables = Array.isArray(schema) ? schema : schema.tables;
  const defaultSchema = Array.isArray(schema) ? undefined : schema.defaultSchema;
  const ref = asTableRef(table);
  const named = tables.filter((t) => t.tableName === ref.name);
  if (ref.schema) return named.find((t) => t.schemaName === ref.schema);
  return named.find((t) => !t.schemaName || t.schemaName === defaultSchema) ?? named[0];
}

/**
 * The table reference a visual query points at. `tableSchema` is set only when
 * the table is outside the connection's default schema, so this is a bare name
 * for every canvas saved before schemas were reported and for every table in
 * `main`, `public` or `dbo`.
 */
export function refForQuery(query: { table: string; tableSchema?: string }): TableRef {
  return asTableRef(query.table, query.tableSchema);
}

/**
 * The reference a table in a fetched schema should be quoted and keyed by:
 * the schema only when it is not the connection's default one.
 */
export function refForTable(table: TableSchema, schema: SchemaInfo): TableRef {
  return table.schemaName && table.schemaName !== schema.defaultSchema
    ? { schema: table.schemaName, name: table.tableName }
    : { name: table.tableName };
}
