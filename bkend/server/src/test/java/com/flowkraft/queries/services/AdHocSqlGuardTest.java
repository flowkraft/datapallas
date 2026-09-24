package com.flowkraft.queries.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.jdbi.v3.core.Jdbi;
import org.junit.jupiter.api.Test;

import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.common.db.SqlExecutor;

/**
 * What {@code POST /api/queries/run-sql} accepts, and what it does with what it accepts.
 *
 * <p>No Spring context: the guard is a pure function and the rollback test wires a
 * {@link SqlExecutor} to a throwaway SQLite file by hand, the way the other tests in this tree
 * wire their collaborators.
 */
public class AdHocSqlGuardTest {

	// ---------------------------------------------------------------- allowed

	@Test
	public void plainSelectIsAllowed() {
		AdHocSqlGuard.check("SELECT * FROM orders WHERE country = 'DE'");
		AdHocSqlGuard.check("  select id, name from customers  ");
		AdHocSqlGuard.check("SELECT 1;");
	}

	@Test
	public void withAndBracketedSelectsAreAllowed() {
		AdHocSqlGuard.check("WITH recent AS (SELECT * FROM orders WHERE ts > '2026-01-01') SELECT * FROM recent");
		AdHocSqlGuard.check("(SELECT 1)");
	}

	@Test
	public void keywordsInsideStringsCommentsAndQuotedIdentifiersAreNotKeywords() {
		AdHocSqlGuard.check("SELECT \"update_date\" FROM orders");
		AdHocSqlGuard.check("SELECT * FROM notes WHERE note = 'drop'");
		AdHocSqlGuard.check("SELECT 1 -- delete everything\n");
		AdHocSqlGuard.check("SELECT 1 /* insert into x */");
		AdHocSqlGuard.check("SELECT * FROM `delete` WHERE x = 1");
		AdHocSqlGuard.check("SELECT * FROM [delete] WHERE x = 1");
		// A value containing a semicolon is one statement, not two.
		AdHocSqlGuard.check("SELECT * FROM notes WHERE note = 'a;b'");
	}

	@Test
	public void functionsThatMerelyLookLikeKeywordsAreAllowed() {
		AdHocSqlGuard.check("SELECT REPLACE(name, 'a', 'b') FROM customers");
		// SQLite's GLOB is an operator, not a call, so it is not the DuckDB glob() file function.
		AdHocSqlGuard.check("SELECT * FROM customers WHERE name GLOB 'a*'");
		AdHocSqlGuard.check("SELECT CAST(x AS CHARACTER SET utf8) FROM t");
	}

	@Test
	public void parameterPlaceholdersAreValuesNotSql() {
		// A filter parameter may be named anything, including a word this guard refuses bare.
		AdHocSqlGuard.check("SELECT * FROM orders WHERE state = ${update}");
		AdHocSqlGuard.check("SELECT * FROM orders WHERE state = #{delete}");
		AdHocSqlGuard.check("SELECT * FROM orders WHERE state = :update");
	}

	// ---------------------------------------------------------------- refused

	@Test
	public void writingStatementsAreRefused() {
		assertRefused("UPDATE orders SET total = 0", "UPDATE");
		assertRefused("DELETE FROM orders", "DELETE");
		assertRefused("INSERT INTO orders VALUES (1)", "INSERT");
		assertRefused("DROP TABLE orders", "DROP");
	}

	@Test
	public void aWriteHiddenInsideAReadIsRefused() {
		assertRefused("WITH x AS (DELETE FROM orders RETURNING *) SELECT * FROM x", "DELETE");
		assertRefused("SELECT * INTO backup FROM orders", "INTO");
	}

	@Test
	public void aSecondStatementIsRefused() {
		assertRefused("SELECT 1; DROP TABLE orders", "more than one statement");
		assertRefused("SELECT 1;;", "more than one statement");
	}

	@Test
	public void reachingOutsideTheDatabaseIsRefused() {
		assertRefused("SELECT * FROM read_csv('/etc/passwd')", "read_csv");
		assertRefused("SELECT * FROM read_parquet('/srv/secret.parquet')", "read_parquet");
		assertRefused("SELECT pg_read_file('/etc/passwd')", "pg_read_file");
		assertRefused("SELECT * FROM glob('/root/*')", "glob");
		assertRefused("SELECT * FROM dblink('dbname=other', 'SELECT 1') AS t(x int)", "dblink");
	}

	@Test
	public void databaseLevelCommandsAreRefused() {
		assertRefused("PRAGMA table_info('orders')", "PRAGMA");
		assertRefused("ATTACH DATABASE '/tmp/x.db' AS x", "ATTACH");
		assertRefused("INSTALL httpfs", "INSTALL");
		assertRefused("CALL some_procedure()", "CALL");
	}

	@Test
	public void anUnquotedColumnNamedLikeAKeywordIsRefusedWithAHint() {
		IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
				() -> AdHocSqlGuard.check("SELECT load FROM sensors"));
		assertTrue(e.getMessage().contains("LOAD"), e.getMessage());
		assertTrue(e.getMessage().contains("quotes"), e.getMessage());
		// Quoting it, as the message says, makes it a column name again.
		AdHocSqlGuard.check("SELECT \"load\" FROM sensors");
	}

	@Test
	public void nothingIsRefused() {
		assertRefused("", "empty");
		assertRefused("   ", "empty");
		assertThrows(IllegalArgumentException.class, () -> AdHocSqlGuard.check(null));
	}

	// ---------------------------------------------------------------- always rolled back

	/**
	 * The guard is the first line of defence and this is the second: a statement that somehow
	 * reaches the database on the ad-hoc path must not leave anything behind. The write below is
	 * handed straight to {@link SqlExecutor#queryOnReadOnly}, as if the guard had missed it.
	 */
	@Test
	public void aWriteThatGetsPastTheGuardIsNotKept() throws Exception {

		Path dbFile = Files.createTempFile("adhoc-rollback-", ".db");
		Files.deleteIfExists(dbFile);
		String url = "jdbc:sqlite:" + dbFile.toAbsolutePath();

		try {
			Jdbi jdbi = Jdbi.create(url);
			jdbi.useHandle(h -> {
				h.execute("CREATE TABLE t (id INTEGER)");
				h.execute("INSERT INTO t VALUES (1)");
			});

			SqlExecutor executor = new SqlExecutor(new DatabaseConnectionManager(null) {
				@Override
				public Jdbi getJdbi(String connectionCode) {
					return Jdbi.create(url);
				}
			});

			// RETURNING makes this a write that also produces rows, so it goes down the same
			// code path a SELECT does and cannot be waved away as "the driver refused it".
			executor.queryOnReadOnly("any-connection", "INSERT INTO t VALUES (2) RETURNING id", null);

			List<Map<String, Object>> rows = jdbi.withHandle(h -> h.createQuery("SELECT COUNT(*) AS c FROM t")
					.map((rs, ctx) -> Map.<String, Object>of("c", rs.getLong(1))).list());
			assertEquals(1L, rows.get(0).get("c"), "the insert must have been rolled back");

			// A real SELECT on the same path still returns its rows.
			List<Map<String, Object>> read = executor.queryOnReadOnly("any-connection", "SELECT id FROM t", null);
			assertEquals(1, read.size());

		} finally {
			Files.deleteIfExists(dbFile);
		}
	}

	// ---------------------------------------------------------------- helper

	private static void assertRefused(String sql, String expectedInMessage) {
		IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> AdHocSqlGuard.check(sql),
				"should have been refused: " + sql);
		assertTrue(e.getMessage().contains(expectedInMessage),
				"message should name the reason (" + expectedInMessage + "), was: " + e.getMessage());
	}
}
