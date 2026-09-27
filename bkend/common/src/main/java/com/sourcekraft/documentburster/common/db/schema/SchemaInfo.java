package com.sourcekraft.documentburster.common.db.schema;

import java.util.ArrayList;
import java.util.List;

/**
 * Root object representing the overall database schema information.
 * Contains lists of tables/views.
 */
public class SchemaInfo {

    /**
     * High-level notes or supplementary information about the entire database schema.
     * Can be used for overall context, summary, or LLM guidance.
     */
    public String notes; // Renamed from description

    /**
     * The schema an unqualified table name resolves to on this connection - what
     * Connection.getSchema() reports, or the vendor default the fetcher used.
     * A client qualifies a table reference only when the table's own
     * {@link TableSchema#schemaName} differs from this, so tables in the default
     * schema keep exactly the SQL they had before schemas were reported at all.
     */
    public String defaultSchema;

    /**
     * A list of tables and views found in the schema.
     */
    public List<TableSchema> tables = new ArrayList<>();

    // Could add other top-level schema info here if needed (e.g., database version, user)
}