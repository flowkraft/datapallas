package com.sourcekraft.documentburster.common.db;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.sourcekraft.documentburster.common.db.schema.ColumnSchema;
import com.sourcekraft.documentburster.common.db.schema.SchemaInfo;
import com.sourcekraft.documentburster.common.db.schema.TableSchema;
import com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;

/**
 * What the fetcher reports for a database that has more than one schema.
 *
 * <p>
 * A connection can hold a table of the same name in two schemas - the shipped demo database does,
 * with <code>cube_demo</code> beside <code>main</code>. The fetcher asks the driver for the tables
 * with a global schema pattern, which is <code>null</code> on DuckDB and SQLite and therefore matches
 * EVERY schema; if it then looks a table's columns up with that same global pattern, it gets the
 * columns of every table of that name, from every schema, merged into one. The AI Hub is then shown a
 * table whose columns do not exist and writes SQL against it.
 * </p>
 *
 * <p>
 * So this test builds the smallest database that shows it: one name, two schemas, different columns.
 * Both tables must come back, each with only its own columns, each saying which schema it is in, and
 * the connection must say which schema is the default one - that last part is what lets the AI Hub
 * leave a <code>main</code> table's SQL exactly as it writes it today and qualify only the tables
 * that are somewhere else.
 * </p>
 *
 * <p>
 * The assertions are vendor-neutral (hence <code>ansi_</code>): no vendor-specific SQL form is
 * asserted anywhere here. DuckDB is the vendor the test runs ON because its <code>null</code> schema
 * pattern is what makes the defect visible, and because a DuckDB file needs no server.
 * </p>
 *
 * <p>
 * <b>Made to go red:</b> passing <code>schemaPattern</code> instead of <code>tableSchemaPattern</code>
 * to <code>fetchColumnsForTable</code> in {@link DatabaseSchemaFetcher} - the one line this test is
 * about - turns both halves of {@link #ansi_twoSchemas_eachTableKeepsItsOwnColumns()} red: each table
 * comes back with all five columns, the two tables' columns merged.
 * </p>
 */
class DatabaseSchemaFetcherSchemaReachTest {

	/** The table that exists twice, once in each schema. */
	private static final String TABLE = "crm_deals";

	/** DuckDB's default schema; nothing about this test hard-codes it as "the" default. */
	private static final String DEFAULT_SCHEMA = "main";

	private static final String OTHER_SCHEMA = "cube_demo";

	@Test
	void ansi_twoSchemas_eachTableKeepsItsOwnColumns(@TempDir Path temp) throws Exception {

		Path file = temp.resolve("two-schemas.duckdb");

		// main.crm_deals and cube_demo.crm_deals: the same name, deliberately different columns, so
		// a merged lookup cannot pass by accident.
		try (Connection connection = DriverManager.getConnection("jdbc:duckdb:" + file.toAbsolutePath());
				Statement statement = connection.createStatement()) {
			statement.execute("CREATE TABLE " + DEFAULT_SCHEMA + "." + TABLE + " (deal_id INTEGER, amount DECIMAL(18,2))");
			statement.execute("CREATE SCHEMA " + OTHER_SCHEMA);
			statement.execute("CREATE TABLE " + OTHER_SCHEMA + "." + TABLE
					+ " (id INTEGER, title VARCHAR, stage VARCHAR)");
		}

		SchemaInfo schemaInfo = new DatabaseSchemaFetcher().fetchSchema(duckdbSettings(file));

		// The default schema, so the AI Hub knows which tables need no qualifying.
		assertEquals(DEFAULT_SCHEMA, schemaInfo.defaultSchema, "defaultSchema");

		List<TableSchema> both = schemaInfo.tables.stream().filter(t -> TABLE.equals(t.tableName))
				.collect(Collectors.toList());
		assertEquals(2, both.size(), "both tables of that name are reported, one per schema: " + names(schemaInfo));

		TableSchema inMain = onlyIn(both, DEFAULT_SCHEMA);
		TableSchema inOther = onlyIn(both, OTHER_SCHEMA);

		// Each table's own columns, and nothing from the other one. This is the half the merged
		// lookup fails: there each table came back with all five columns.
		assertEquals("amount,deal_id", columns(inMain), "columns of " + DEFAULT_SCHEMA + "." + TABLE);
		assertEquals("id,stage,title", columns(inOther), "columns of " + OTHER_SCHEMA + "." + TABLE);
	}

	@Test
	void ansi_singleSchema_reportsTheSchemaItIsIn(@TempDir Path temp) throws Exception {

		// A database with only the default schema - what almost every connection is. Nothing about
		// the report may change for it beyond the two new fields being filled in.
		Path file = temp.resolve("one-schema.duckdb");
		try (Connection connection = DriverManager.getConnection("jdbc:duckdb:" + file.toAbsolutePath());
				Statement statement = connection.createStatement()) {
			statement.execute("CREATE TABLE " + TABLE + " (deal_id INTEGER, amount DECIMAL(18,2))");
		}

		SchemaInfo schemaInfo = new DatabaseSchemaFetcher().fetchSchema(duckdbSettings(file));

		assertEquals(DEFAULT_SCHEMA, schemaInfo.defaultSchema, "defaultSchema");
		assertEquals(1, schemaInfo.tables.size(), "one table: " + names(schemaInfo));
		TableSchema table = schemaInfo.tables.get(0);
		assertEquals(TABLE, table.tableName);
		assertEquals(DEFAULT_SCHEMA, table.schemaName, "schemaName is filled in even for the default schema");
		assertEquals("amount,deal_id", columns(table));
	}

	/**
	 * The pair identifies a table: two tables of the same name in different schemas are two
	 * different tables. {@link TableSchema#equals} said they were the same one before this change,
	 * which is what would let a lookup by name alone keep finding the wrong one.
	 */
	@Test
	void ansi_tableSchema_equalsAndHashCodeUseTheSchemaToo() {

		TableSchema inMain = new TableSchema();
		inMain.tableName = TABLE;
		inMain.schemaName = DEFAULT_SCHEMA;

		TableSchema inOther = new TableSchema();
		inOther.tableName = TABLE;
		inOther.schemaName = OTHER_SCHEMA;

		TableSchema sameAsInMain = new TableSchema();
		sameAsInMain.tableName = TABLE;
		sameAsInMain.schemaName = DEFAULT_SCHEMA;

		assertTrue(!inMain.equals(inOther), "the same name in two schemas is two tables");
		assertEquals(inMain, sameAsInMain, "the same name in the same schema is one table");
		assertEquals(inMain.hashCode(), sameAsInMain.hashCode());
		assertTrue(inMain.toString().contains(DEFAULT_SCHEMA), "toString names the schema: " + inMain);
	}

	private static DocumentBursterConnectionDatabaseSettings duckdbSettings(Path file) {

		ServerDatabaseSettings server = new ServerDatabaseSettings();
		server.type = "duckdb";
		server.database = file.toAbsolutePath().toString();

		ConnectionDatabaseSettings connection = new ConnectionDatabaseSettings();
		connection.code = "two-schemas";
		connection.name = "two schemas";
		connection.databaseserver = server;

		DocumentBursterConnectionDatabaseSettings settings = new DocumentBursterConnectionDatabaseSettings();
		settings.connection = connection;
		return settings;
	}

	private static TableSchema onlyIn(List<TableSchema> tables, String schemaName) {

		List<TableSchema> found = tables.stream().filter(t -> schemaName.equals(t.schemaName))
				.collect(Collectors.toList());
		assertEquals(1, found.size(), "exactly one " + schemaName + "." + TABLE);
		assertNotNull(found.get(0).columns, "columns of " + schemaName + "." + TABLE);
		return found.get(0);
	}

	/** The table's column names, sorted, so the assertion does not depend on the driver's order. */
	private static String columns(TableSchema table) {
		return table.columns.stream().map((ColumnSchema c) -> c.columnName).sorted()
				.collect(Collectors.joining(","));
	}

	private static String names(SchemaInfo schemaInfo) {
		return schemaInfo.tables.stream().map(t -> t.schemaName + "." + t.tableName)
				.collect(Collectors.joining(", "));
	}
}
