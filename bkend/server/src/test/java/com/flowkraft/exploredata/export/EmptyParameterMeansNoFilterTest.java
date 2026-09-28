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

import com.flowkraft.queries.services.QueriesService;
import com.sourcekraft.documentburster.common.db.SeedScriptRunner;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;

/**
 * A dashboard filter with nothing in it is not a filter: the rows come back as if it were not
 * there - on the canvas and on the published dashboard, which is the same question asked twice.
 *
 * <p>Both paths are run here against the frozen {@code cube_demo} rows on the two legs that need no
 * container. The canvas path is {@code QueriesService.prepare} followed by JDBI, the production
 * path; the published path is the script {@link ScriptAssembler} writes, run through a GroovyShell
 * on the same connection. The three answers - 1,200 with nothing filled in, 394 and 425 with one
 * filter filled in - are the frozen data's own (the AI Hub cases p1d and p1a of
 * {@code truths-ai-hub.out}, and the 1,200 rows of {@code crm_deals.psv}), and both paths are held
 * to all three.
 */
class EmptyParameterMeansNoFilterTest {

	private static final String DB_TEMPLATE_DB = "../../asbl/src/main/external-resources/db-template/db";

	/** Every deal: what an unfiltered question answers (crm_deals.psv). */
	private static final int ALL_DEALS = 1200;

	/** Over 31999.99, all of them, whenever the close date is not filtered (case p1d). */
	private static final int DEALS_OVER_AMOUNT = 394;

	/** Closing on or before 2026-01-31, whatever the amount (case p1a). */
	private static final int DEALS_BY_DATE = 425;

	/**
	 * The shape the Visualize step writes: one condition per line, the first carrying the WHERE and
	 * the rest joined with AND - a date, a number and a list, each bound to a dashboard parameter.
	 */
	private static final String SQL = "SELECT COUNT(*) AS deal_count\n"
			+ "FROM cube_demo.crm_deals\n"
			+ "WHERE close_date <= ${to}\n"
			+ "  AND amount > ${min}\n"
			+ "  AND stage IN (${stages})";

	private static final Map<String, String> TYPES = Map.of("to", "Date", "min", "Double");

	@TempDir
	Path tempDir;

	@Test
	void ansi_an_empty_date_number_or_list_parameter_leaves_its_filter_out() throws Exception {
		for (String vendor : List.of("duckdb", "sqlite")) {
			try (Connection connection = open(vendor)) {

				// Nothing filled in: three filters, none of them applied, every deal.
				assertEquals(ALL_DEALS, onCanvas(connection, values("", "", "")),
						vendor + ", canvas: no value in any of the three filters, so none is applied");

				// The amount filled in, the date and the list still empty. This is the line the
				// WHERE sits on being left out: what is left has to keep asking a whole question.
				assertEquals(DEALS_OVER_AMOUNT, onCanvas(connection, values("", "31999.99", "")),
						vendor + ", canvas: only the amount filter is applied");

				// The other way round: the first filter applied, the two after it left out.
				assertEquals(DEALS_BY_DATE, onCanvas(connection, values("2026-01-31", "", "")),
						vendor + ", canvas: only the date filter is applied");
			}
		}
	}

	@Test
	void ansi_the_published_dashboard_answers_the_same_as_the_canvas() throws Exception {
		for (String vendor : List.of("duckdb", "sqlite")) {
			try (Connection connection = open(vendor)) {

				assertEquals(ALL_DEALS, published(connection, values("", "", "")),
						vendor + ", published: no value in any of the three filters");
				assertEquals(DEALS_OVER_AMOUNT, published(connection, values("", "31999.99", "")),
						vendor + ", published: only the amount filter is applied");
				assertEquals(DEALS_BY_DATE, published(connection, values("2026-01-31", "", "")),
						vendor + ", published: only the date filter is applied");
			}
		}
	}

	// ── The two paths ────────────────────────────────────────────────────────────

	/** What the canvas asks: the production {@code prepare}, then JDBI, on this connection. */
	private static long onCanvas(Connection connection, Map<String, Object> values) {
		QueriesService.PreparedSql prepared = QueriesService.prepare(SQL, values, TYPES);
		org.jdbi.v3.core.Jdbi jdbi = com.sourcekraft.documentburster.common.reportparameters.ParameterArguments
				.install(org.jdbi.v3.core.Jdbi.create(() -> notClosing(connection)));
		try (org.jdbi.v3.core.Handle handle = jdbi.open()) {
			org.jdbi.v3.core.statement.Query query = handle.createQuery(prepared.sql());
			if (prepared.params() != null) {
				for (Map.Entry<String, Object> bind : prepared.params().entrySet()) {
					if (bind.getValue() instanceof List<?> list) query.bindList(bind.getKey(), list);
					else query.bind(bind.getKey(), bind.getValue());
				}
			}
			return query.mapTo(Long.class).one();
		}
	}

	/** What the published dashboard asks: the assembled script, on the same connection. */
	@SuppressWarnings("unchecked")
	private static long published(Connection connection, Map<String, Object> values) throws Exception {

		Map<String, Object> dataSource = new LinkedHashMap<>();
		dataSource.put("mode", "sql");
		dataSource.put("sql", SQL);
		Map<String, Object> widget = new LinkedHashMap<>();
		widget.put("id", "w-a");
		widget.put("type", "tabulator");
		widget.put("dataSource", dataSource);

		List<Map<String, Object>> parameters = new ArrayList<>();
		parameters.add(Map.of("id", "to", "type", "Date"));
		parameters.add(Map.of("id", "min", "type", "Double"));
		parameters.add(Map.of("id", "stages"));
		String script = ScriptAssembler.assemble(List.of(widget), parameters).text();

		Binding binding = new Binding();
		Map<String, List<Map<String, Object>>> reported = new LinkedHashMap<>();
		binding.setVariable("reported", reported);
		binding.setVariable("userVarsIn", new LinkedHashMap<>(values));
		binding.setVariable("connectionIn", notClosing(connection));
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

		List<Map<String, Object>> rows = reported.get("tabulator_a");
		if (rows == null || rows.isEmpty()) {
			throw new IllegalStateException("the widget reported no rows: " + reported);
		}
		return ((Number) rows.get(0).values().iterator().next()).longValue();
	}

	// ── Helpers ──────────────────────────────────────────────────────────────────

	/** The three filter-bar values, as text - which is all an HTML control ever writes. */
	private static Map<String, Object> values(String to, String min, String stages) {
		Map<String, Object> values = new LinkedHashMap<>();
		values.put("to", to);
		values.put("min", min);
		values.put("stages", stages);
		return values;
	}

	/**
	 * A handle closes its connection when it closes; this is the one connection of the throwaway
	 * database, so it is handed over as a proxy that ignores close().
	 */
	private static Connection notClosing(Connection connection) {
		return (Connection) java.lang.reflect.Proxy.newProxyInstance(
				EmptyParameterMeansNoFilterTest.class.getClassLoader(), new Class<?>[] { Connection.class },
				(proxy, method, arguments) -> {
					if ("close".equals(method.getName())) return null;
					try {
						return method.invoke(connection, arguments);
					} catch (java.lang.reflect.InvocationTargetException wrapped) {
						throw wrapped.getCause();
					}
				});
	}

	/** A throwaway database of this vendor, carrying the frozen {@code cube_demo} rows. */
	private Connection open(String vendor) throws Exception {

		if ("duckdb".equals(vendor)) {
			return DriverManager.getConnection("jdbc:duckdb:"
					+ NorthwindFixture.writableCopy(tempDir.resolve("northwind.duckdb")).toAbsolutePath());
		}

		Path main = NorthwindFixture.writableSqliteCopy(tempDir.resolve("northwind.db"));
		Connection connection = DriverManager
				.getConnection("jdbc:sqlite:" + main.toAbsolutePath().toString().replace("\\", "/"));
		try (Statement statement = connection.createStatement()) {
			statement.execute("ATTACH DATABASE '"
					+ tempDir.resolve("cube-demo.db").toAbsolutePath().toString().replace("\\", "/")
					+ "' AS cube_demo");
		}

		Path script = Paths.get(DB_TEMPLATE_DB, "scripts", "cube-demo-data.groovy");
		if (!Files.exists(script)) {
			throw new IllegalStateException("The seed script is missing: " + script.toAbsolutePath());
		}
		SeedScriptRunner.run(connection, vendor.toUpperCase(Locale.ROOT), script,
				NorthwindFixture.cubeDemoSeedParams(script.getParent().resolve("cube-demo-data")));
		return connection;
	}
}
