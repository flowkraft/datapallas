package com.flowkraft.exploredata.export;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.sourcekraft.documentburster.common.db.SeedScriptRunner;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;

/**
 * The script a published dashboard runs binds its parameters as their declared type — asked of a
 * real database, not of a stub.
 *
 * <p>{@link ScriptAssemblerTest} says what the assembler writes and what reaches JDBC; this says
 * what the database then answers, on the two legs that need no container. The rows are the frozen
 * demo data of {@code cube_demo}, and the answers are the ones {@code truths-ai-hub.out} states for
 * the AI Hub cases p1a and p1d — the same two questions the canvas path asks through
 * {@code QueriesService}, so the two paths are held to one answer.
 *
 * <p>DuckDB runs on a copy of the shipped sample, which already carries {@code cube_demo}; SQLite
 * attaches a second file and seeds it with the product's own seed script, the way
 * {@code GeneratedSqlAllVendorsTest} does. Nothing shipped is ever written to.
 */
class PublishedScriptParameterTypesTest {

	private static final String DB_TEMPLATE_DB = "../../asbl/src/main/external-resources/db-template/db";

	/** 425 of the 500 deals close on or before this date (truths-ai-hub.out, case p1a). */
	private static final int DEALS_BY_DATE = 425;

	/**
	 * 394 are over 31999.99 (case p1d). Nine deals are exactly 32000.00, so an Integer 32000
	 * answers 385: a fraction that never left the text bind would show up here.
	 */
	private static final int DEALS_OVER_AMOUNT = 394;

	@TempDir
	Path tempDir;

	@Test
	void ansi_the_published_script_binds_a_date_and_a_double_as_what_they_are() throws Exception {
		for (String vendor : List.of("duckdb", "sqlite")) {
			try (Connection connection = open(vendor)) {

				String script = assemble(Map.of("to", "Date", "min", "Double"),
						"SELECT COUNT(*) AS deal_count\nFROM cube_demo.crm_deals\nWHERE close_date <= ${to}",
						"SELECT COUNT(*) AS big_deal_count\nFROM cube_demo.crm_deals\nWHERE amount > ${min}");

				Map<String, List<Map<String, Object>>> answers = run(connection, script,
						Map.of("to", "2026-01-31", "min", "31999.99"));

				assertEquals(DEALS_BY_DATE, number(answers, "tabulator_a", "deal_count"),
						vendor + ": the deals closing on or before 2026-01-31, the date bound as a date");
				assertEquals(DEALS_OVER_AMOUNT, number(answers, "tabulator_b", "big_deal_count"),
						vendor + ": the deals over 31999.99, the amount bound with its fraction");
			}
		}
	}

	/**
	 * 18 invoices are issued in the first week of January 2025, the 8th included (truths-ai-hub.out,
	 * cases p1e and p1f). Two of them are issued on the 8th, so an upper bound that stops at the
	 * parameter itself answers 16.
	 */
	private static final int INVOICES_FIRST_WEEK = 18;

	@Test
	void ansi_the_published_script_derives_the_day_a_date_range_ends_at() throws Exception {
		for (String vendor : List.of("duckdb", "sqlite")) {
			try (Connection connection = open(vendor)) {

				// The generator writes ${to__next_day} and nothing declares it: the assembler derives it
				// from `to`, the way QueriesService does for the canvas, so both paths ask one question.
				String script = assemble(Map.of("from", "Date", "to", "Date"),
						"SELECT COUNT(*) AS invoice_count\nFROM cube_demo.erp_invoices\n"
								+ "WHERE issue_date >= ${from} AND issue_date < ${to__next_day}");

				Map<String, List<Map<String, Object>>> answers = run(connection, script,
						Map.of("from", "2025-01-01", "to", "2025-01-08"));

				assertEquals(INVOICES_FIRST_WEEK, number(answers, "tabulator_a", "invoice_count"),
						vendor + ": the whole week, the day it ends at included");
			}
		}
	}

	// ── Helpers ──────────────────────────────────────────────────────────────────

	/** Two SQL widgets, one per query, with a declared type beside each parameter id. */
	private static String assemble(Map<String, String> types, String... sql) throws Exception {
		List<Map<String, Object>> widgets = new ArrayList<>();
		String[] ids = { "w-a", "w-b" };
		for (int i = 0; i < sql.length; i++) {
			Map<String, Object> dataSource = new LinkedHashMap<>();
			dataSource.put("mode", "sql");
			dataSource.put("sql", sql[i]);
			Map<String, Object> widget = new LinkedHashMap<>();
			widget.put("id", ids[i]);
			widget.put("type", "tabulator");
			widget.put("dataSource", dataSource);
			widgets.add(widget);
		}
		List<Map<String, Object>> parameters = new ArrayList<>();
		for (Map.Entry<String, String> one : types.entrySet())
			parameters.add(Map.of("id", one.getKey(), "type", one.getValue()));
		return ScriptAssembler.assemble(widgets, parameters).text();
	}

	/**
	 * Runs the assembled script against a ctx whose {@code dbSql} is a real {@code groovy.sql.Sql}
	 * on this connection — the object the published dashboard's runtime hands the script — and
	 * returns what each widget reported.
	 */
	@SuppressWarnings("unchecked")
	private static Map<String, List<Map<String, Object>>> run(Connection connection, String script,
			Map<String, String> userVars) {

		Binding binding = new Binding();
		Map<String, List<Map<String, Object>>> reported = new LinkedHashMap<>();
		binding.setVariable("reported", reported);
		binding.setVariable("userVarsIn", new LinkedHashMap<>(userVars));
		binding.setVariable("connectionIn", connection);
		GroovyShell shell = new GroovyShell(binding);
		binding.setVariable("ctx", shell.evaluate("""
				def dbSql = new groovy.sql.Sql(connectionIn)
				def vars = new Expando()
				vars.get = { k -> null }
				vars.getUserVariables = { t -> userVarsIn }
				def ctx = new Expando(dbSql: dbSql, variables: vars, token: '')
				ctx.reportData = { id, rows -> reported[id] = rows }
				ctx
				"""));
		shell.evaluate(script);
		return reported;
	}

	private static int number(Map<String, List<Map<String, Object>>> answers, String widgetId, String column) {
		List<Map<String, Object>> rows = answers.get(widgetId);
		if (rows == null || rows.isEmpty()) {
			throw new IllegalStateException("widget " + widgetId + " reported no rows: " + answers);
		}
		Object value = rows.get(0).get(column);
		if (value == null) {
			// A vendor may answer the column under another case; one row, one number.
			value = rows.get(0).values().iterator().next();
		}
		return ((Number) value).intValue();
	}

	/** A throwaway database of this vendor, carrying the frozen {@code cube_demo} rows. */
	private Connection open(String vendor) throws Exception {

		if ("duckdb".equals(vendor)) {
			// The shipped sample already carries cube_demo, and this is a copy of it.
			return DriverManager.getConnection("jdbc:duckdb:"
					+ NorthwindFixture.writableCopy(tempDir.resolve("northwind.duckdb")).toAbsolutePath());
		}

		Path main = NorthwindFixture.writableSqliteCopy(tempDir.resolve("northwind.db"));
		Connection connection = DriverManager
				.getConnection("jdbc:sqlite:" + main.toAbsolutePath().toString().replace("\\", "/"));
		// SQLite has no schemas: cube_demo is a second file attached to this one connection, which
		// is what the seed script asks for and what the shipped sample does.
		try (Statement statement = connection.createStatement()) {
			statement.execute("ATTACH DATABASE '"
					+ tempDir.resolve("cube-demo.db").toAbsolutePath().toString().replace("\\", "/")
					+ "' AS cube_demo");
		}

		Path script = Paths.get(DB_TEMPLATE_DB, "scripts", "cube-demo-data.groovy");
		if (!Files.exists(script)) {
			throw new IllegalStateException("The seed script is missing: " + script.toAbsolutePath());
		}
		// The day is pinned, the way every other check of this data pins it: the script shifts the
		// rows to the day it is given, and the answers above are that day's.
		SeedScriptRunner.run(connection, vendor.toUpperCase(Locale.ROOT), script,
				NorthwindFixture.cubeDemoSeedParams(script.getParent().resolve("cube-demo-data")));
		return connection;
	}
}
