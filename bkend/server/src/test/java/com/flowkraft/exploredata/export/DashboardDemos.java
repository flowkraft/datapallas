package com.flowkraft.exploredata.export;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sourcekraft.documentburster.common.db.SeedScriptRunner;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;

/**
 * The 25 Dashboard Demos, as the tests of this package read them.
 *
 * <p>Three files describe one demo, and this class is the only place that knows where they are and
 * how they fit together:
 * <ul>
 *   <li>{@code config/samples/g-<id>/g-<id>.canvas.json} - the canvas the author built, which is
 *       what the product's own exporter is fed;</li>
 *   <li>{@code config/samples/g-<id>/g-<id>-stories.json} - the questions a reader clicks;</li>
 *   <li>{@code frend/reporting/e2e/dashboard-demos/checks/<nn>-<id>.checks.json} - what every tile
 *       shows at the defaults and under each interaction, and how crowded each bucket is.</li>
 * </ul>
 * and {@code config/samples/dashboard-demos.json} lists all 25 in Gallery order.
 *
 * <p>{@link #answers} is the point of the whole arrangement: it does not re-implement the
 * dashboard's rules, it runs the dashboard. {@link ScriptAssembler} writes the script a published
 * demo runs, the script is evaluated on the frozen {@code dash_demo} rows with the reader's
 * answers bound as {@code userVariables}, and what comes back is what each tile was handed. So the
 * empty-value rule, the derived {@code __next_day} and the typed binds are the product's, and a
 * change to any of them moves these tests.
 *
 * <p>The database is seeded once per JVM from the shipped seed script, on the day the checks pin
 * ({@value #DASH_DEMO_TODAY}), and every test reads that one copy. Nothing in the tree is written
 * to.
 */
final class DashboardDemos {

	/** Where the demos ship: the folder the installer lays down. */
	static final String SAMPLES = "../../asbl/src/main/external-resources/db-template/config/samples";

	/** The frozen answers, beside the e2e that also reads them. */
	static final String CHECKS = "../../frend/reporting/e2e/dashboard-demos/checks";

	/** The shipped seed script and its rows. */
	static final String DB_SCRIPTS = "../../asbl/src/main/external-resources/db-template/db/scripts";

	/** The DuckDB Northwind sample connection, which is where {@code dash_demo} lives. */
	static final String CONNECTION = "rbt-sample-northwind-duckdb-4f2";

	/** The day the demo data is frozen on, and the day every claim in the checks was measured on. */
	static final String DASH_DEMO_TODAY = "2026-09-30";

	/** Where a seeded copy is kept, so 25 demos are not 25 seed runs. */
	private static final String WORK = "./target/test-output/dashboard-demos";

	static final ObjectMapper JSON = new ObjectMapper();

	private DashboardDemos() {
	}

	// ── One demo ──────────────────────────────────────────────────────────────

	/**
	 * A demo and its three files. {@code nn} is its place in the Gallery, which is also the number
	 * its widget ids carry ({@code w-dd04-revenue}) and the number its checks file is named after.
	 */
	record Demo(int nn, String id, String reportId, Map<String, Object> index,
			Map<String, Object> canvas, Map<String, Object> checks) {

		/** The prefix every widget id of this demo carries. */
		String widgetPrefix() {
			return String.format("w-dd%02d-", nn);
		}

		@SuppressWarnings("unchecked")
		Map<String, Object> state() {
			Object state = canvas.get("state");
			return state instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
		}

		@SuppressWarnings("unchecked")
		List<Map<String, Object>> widgets() {
			Object widgets = state().get("widgets");
			return widgets instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
		}

		@SuppressWarnings("unchecked")
		List<Map<String, Object>> parameters() {
			Object config = state().get("parametersConfig");
			if (!(config instanceof Map<?, ?> map))
				return List.of();
			Object parameters = ((Map<String, Object>) map).get("parameters");
			return parameters instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
		}

		/** The widget a claim names: the checks write the id without this demo's prefix. */
		Map<String, Object> widget(String key) {
			String id = widgetPrefix() + key;
			for (Map<String, Object> widget : widgets())
				if (id.equals(Objects.toString(widget.get("id"), "")))
					return widget;
			throw new IllegalStateException(
					reportId + " has no widget '" + id + "'; it has " + widgetIds());
		}

		List<String> widgetIds() {
			List<String> ids = new ArrayList<>();
			for (Map<String, Object> widget : widgets())
				ids.add(Objects.toString(widget.get("id"), ""));
			return ids;
		}

		/** What the demo opens with. */
		@SuppressWarnings("unchecked")
		Map<String, Object> defaults() {
			Object defaults = checks.get("defaults");
			return defaults instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
		}

		@SuppressWarnings("unchecked")
		List<Map<String, Object>> interactions() {
			Object list = checks.get("interactions");
			return list instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
		}

		@SuppressWarnings("unchecked")
		List<Map<String, Object>> kpis() {
			Object list = checks.get("kpis");
			return list instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
		}

		@SuppressWarnings("unchecked")
		List<Map<String, Object>> density() {
			Object list = checks.get("density");
			return list instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
		}

		/** The interaction a story or a density entry names. */
		@SuppressWarnings("unchecked")
		Map<String, Object> interaction(String id) {
			for (Map<String, Object> one : interactions())
				if (id.equals(Objects.toString(one.get("id"), "")))
					return one;
			throw new IllegalStateException(reportId + " has no interaction '" + id + "'");
		}

		/** The values a tile is read under: the defaults, with this interaction's answers over them. */
		@SuppressWarnings("unchecked")
		Map<String, Object> paramsOf(String interactionId) {
			Map<String, Object> values = new LinkedHashMap<>(defaults());
			if (!"defaults".equals(interactionId)) {
				Object params = interaction(interactionId).get("params");
				if (params instanceof Map<?, ?> map)
					values.putAll((Map<String, Object>) map);
			}
			return values;
		}

		/** The stories file, or an empty list where the demo ships none. */
		@SuppressWarnings("unchecked")
		List<Map<String, Object>> stories() throws Exception {
			Path path = Paths.get(SAMPLES, reportId, reportId + "-stories.json");
			if (!Files.exists(path))
				return List.of();
			return JSON.readValue(Files.readString(path), List.class);
		}
	}

	// ── The 25, in Gallery order ──────────────────────────────────────────────

	/** {@code dashboard-demos.json}: the one index everyone reads. */
	@SuppressWarnings("unchecked")
	static List<Map<String, Object>> index() throws Exception {
		Path path = Paths.get(SAMPLES, "dashboard-demos.json");
		if (!Files.exists(path))
			throw new IllegalStateException("The index is missing: " + path.toAbsolutePath());
		Map<String, Object> read = JSON.readValue(Files.readString(path), Map.class);
		Object demos = read.get("demos");
		if (!(demos instanceof List<?> list) || list.isEmpty())
			throw new IllegalStateException("The index lists no demo: " + path.toAbsolutePath());
		return (List<Map<String, Object>>) list;
	}

	@SuppressWarnings("unchecked")
	static List<Demo> all() throws Exception {
		List<Demo> demos = new ArrayList<>();
		for (Map<String, Object> entry : index()) {
			int nn = Integer.parseInt(Objects.toString(entry.get("nn"), "0").trim());
			String id = Objects.toString(entry.get("id"), "");
			String reportId = Objects.toString(entry.get("reportId"), "");
			Path canvasPath = Paths.get(SAMPLES, reportId, reportId + ".canvas.json");
			Path checksPath = Paths.get(CHECKS, String.format("%02d-%s.checks.json", nn, id));
			for (Path path : List.of(canvasPath, checksPath))
				if (!Files.exists(path))
					throw new IllegalStateException(reportId + " is missing " + path.toAbsolutePath());
			demos.add(new Demo(nn, id, reportId, entry,
					JSON.readValue(Files.readString(canvasPath), Map.class),
					JSON.readValue(Files.readString(checksPath), Map.class)));
		}
		return demos;
	}

	// ── What the published dashboard answers ──────────────────────────────────

	/**
	 * The rows every tile of this demo was handed, for one set of reader's answers.
	 *
	 * <p>The script is the one {@link ScriptAssembler} writes for this canvas - the very script the
	 * shipped folder holds - and the ctx it is given is the one a published dashboard's runtime
	 * hands it. So the empty-value rule, the {@code __next_day} a date range needs and the typed
	 * binds are applied by the product, not by this test.
	 */
	static Map<String, List<Map<String, Object>>> answers(Demo demo, Map<String, Object> params,
			Connection connection) throws Exception {

		String script = ScriptAssembler.assemble(demo.widgets(), demo.parameters()).text();

		Binding binding = new Binding();
		Map<String, List<Map<String, Object>>> reported = new LinkedHashMap<>();
		binding.setVariable("reported", reported);
		binding.setVariable("userVarsIn", new LinkedHashMap<>(userVariables(params)));
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
		return reported;
	}

	/**
	 * The reader's answers as the request carries them: text, every one of them.
	 *
	 * <p>A multiselect arrives comma-separated, which is what the assembler's list binder splits on
	 * ({@code ... IN (?, ?, ?)}), and a checkbox arrives as {@code true}/{@code false}, which is
	 * what {@code ParameterTypes.typed} turns back into a Boolean. Nothing picked is the empty
	 * string, and an empty value takes its own condition line out of the query.
	 */
	static Map<String, String> userVariables(Map<String, Object> params) {
		Map<String, String> values = new LinkedHashMap<>();
		for (Map.Entry<String, Object> one : params.entrySet())
			values.put(one.getKey(), text(one.getValue()));
		return values;
	}

	private static String text(Object value) {
		if (value == null)
			return "";
		if (value instanceof List<?> list) {
			List<String> items = new ArrayList<>();
			for (Object item : list)
				items.add(Objects.toString(item, ""));
			return String.join(",", items);
		}
		return String.valueOf(value);
	}

	/** The name the dashboard's own files call this widget, which is the key it reports under. */
	static String componentIdOf(Map<String, Object> widget) {
		return ScriptAssembler.componentId(widget);
	}

	// ── What a tile shows ─────────────────────────────────────────────────────

	/**
	 * The number this widget shows a reader, out of the rows its query returned.
	 *
	 * <p>Each type reads its own row and its own column, because that is what the component draws: a
	 * trend shows its last point, a gauge and a progress bar their own field, a number its own, and
	 * a table's own reading is how long it is. A claim about one bar or one slice names the column
	 * it is in and the row it is about, because one query answers several claims. A percent-formatted
	 * tile holds a fraction and the component writes the percent, so what is compared is the percent
	 * - unless the claim names a column itself, which is then read as it stands.
	 *
	 * <p>The same readings the authoring checker applies, on the same claims, so a demo cannot pass
	 * one and fail the other.
	 */
	@SuppressWarnings("unchecked")
	static Object reading(Map<String, Object> widget, List<Map<String, Object>> rows,
			Map<String, Object> kpi) {

		String how = Objects.toString(kpi.get("reading"), "");
		String column = kpi.get("column") == null ? null : String.valueOf(kpi.get("column"));
		List<Map<String, Object>> answered = rows == null ? List.of() : rows;

		if ("rows".equals(how))
			return answered.size();
		if ("distinct".equals(how)) {
			Set<String> seen = new LinkedHashSet<>();
			for (Map<String, Object> row : answered)
				seen.add(Objects.toString(valueOf(row, column), ""));
			return seen.size();
		}
		if (answered.isEmpty())
			return null;

		if ("argmax".equals(how)) {
			Map<String, Object> peak = null;
			double best = Double.NEGATIVE_INFINITY;
			for (Map<String, Object> row : answered) {
				Object value = valueOf(row, column);
				if (value == null)
					continue;
				double number = ((Number) value).doubleValue();
				if (number > best) {
					best = number;
					peak = row;
				}
			}
			if (peak == null)
				return null;
			List<String> labels = new ArrayList<>();
			Object named = kpi.get("labels");
			for (Object label : named instanceof List<?> list ? list : List.of())
				labels.add(Objects.toString(valueOf(peak, String.valueOf(label)), ""));
			return String.join(" ", labels);
		}

		Object rowIs = kpi.get("row");
		if (rowIs instanceof Map<?, ?> wanted) {
			List<Map<String, Object>> kept = new ArrayList<>();
			for (Map<String, Object> row : answered)
				if (holds(row, (Map<String, Object>) wanted))
					kept.add(row);
			if (kept.isEmpty())
				return null;
			answered = kept;
		}

		if ("mean".equals(how)) {
			double sum = 0;
			for (Map<String, Object> row : answered)
				sum += ((Number) valueOf(row, column)).doubleValue();
			return sum / answered.size();
		}
		if (column != null)
			return valueOf(answered.get(0), column);

		Map<String, Object> display = displayConfig(widget);
		String type = Objects.toString(widget.get("type"), "");
		String field;
		Map<String, Object> row;
		switch (type) {
			case "trend" -> {
				field = Objects.toString(display.get("valueField"), "");
				row = answered.get(answered.size() - 1);
			}
			case "gauge", "progress" -> {
				field = Objects.toString(display.get("field"), "");
				row = answered.get(0);
			}
			case "number" -> {
				field = Objects.toString(display.get("numberField"), "");
				row = answered.get(0);
			}
			default -> {
				field = "";
				row = answered.get(0);
			}
		}
		// A visual-mode tile names the source column and the builder aliased it
		// (total_amount_sum), so the first column is the reading wherever the named one is not in
		// the answer.
		Object value = has(row, field) ? valueOf(row, field) : first(row);

		String format = firstText(display, "numberFormat", "gaugeFormat", "format");
		if ("percent".equals(format) && value instanceof Number number)
			return number.doubleValue() * 100;
		return value;
	}

	/** Whether a claim's value is the one the tile shows. */
	static boolean shows(Object want, Object got) {
		if (want == null)
			return got == null;
		if (want instanceof String text)
			return got != null && String.valueOf(got).equals(text);
		if (got == null)
			return false;
		double wanted = ((Number) want).doubleValue();
		double shown = got instanceof Number number ? number.doubleValue()
				: Double.parseDouble(String.valueOf(got));
		return Math.abs(shown - wanted) <= 0.005;
	}

	private static boolean holds(Map<String, Object> row, Map<String, Object> wanted) {
		for (Map.Entry<String, Object> one : wanted.entrySet()) {
			String got = Objects.toString(valueOf(row, one.getKey()), "");
			Object value = one.getValue();
			if (value instanceof List<?> any) {
				boolean matched = false;
				for (Object item : any)
					matched |= got.equals(Objects.toString(item, ""));
				if (!matched)
					return false;
			} else if (!got.equals(Objects.toString(value, ""))) {
				return false;
			}
		}
		return true;
	}

	/**
	 * A column of one row. A vendor may answer under another case, so the name is compared without
	 * it - the alias is the query's own and a case-insensitive lookup cannot pick the wrong column.
	 */
	private static Object valueOf(Map<String, Object> row, String column) {
		if (column == null)
			return first(row);
		if (row.containsKey(column))
			return row.get(column);
		for (Map.Entry<String, Object> one : row.entrySet())
			if (one.getKey().equalsIgnoreCase(column))
				return one.getValue();
		throw new IllegalStateException("no column '" + column + "' in " + row.keySet());
	}

	private static boolean has(Map<String, Object> row, String column) {
		if (column == null || column.isEmpty())
			return false;
		if (row.containsKey(column))
			return true;
		for (String name : row.keySet())
			if (name.equalsIgnoreCase(column))
				return true;
		return false;
	}

	private static Object first(Map<String, Object> row) {
		return row.isEmpty() ? null : row.values().iterator().next();
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> displayConfig(Map<String, Object> widget) {
		Object display = widget.get("displayConfig");
		return display instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
	}

	private static String firstText(Map<String, Object> display, String... keys) {
		for (String key : keys) {
			String value = Objects.toString(display.get(key), "");
			if (!value.isEmpty())
				return value;
		}
		return "";
	}

	// ── The frozen rows ───────────────────────────────────────────────────────

	/**
	 * The one seeded {@code dash_demo} of this JVM.
	 *
	 * <p>219,491 rows is a minute of somebody's afternoon, so it is loaded once and every case reads
	 * that copy. The queries are all SELECTs: there is nothing for one case to leave behind for the
	 * next.
	 */
	static synchronized Connection dashDemo() throws Exception {
		if (dashDemo != null)
			return dashDemo;

		Path work = Paths.get(WORK).toAbsolutePath();
		Files.createDirectories(work);
		Path database = work.resolve("dash-demo.duckdb");
		Files.deleteIfExists(database);

		Path script = shipScript(work);
		Connection connection = DriverManager.getConnection("jdbc:duckdb:" + database);
		SeedScriptRunner.run(connection, "DUCKDB", script, Map.of(
				"today", DASH_DEMO_TODAY,
				"wipe", "true",
				"dataDir", script.getParent().resolve("dashboards-demo-data").toAbsolutePath().toString()));
		dashDemo = connection;
		return dashDemo;
	}

	private static Connection dashDemo;

	/** The shipped seed script and its rows, copied out: the tree is never written to. */
	private static Path shipScript(Path work) throws Exception {

		Path shipped = Paths.get(DB_SCRIPTS).toAbsolutePath();
		if (!Files.exists(shipped.resolve("dashboards-demo-data.groovy")))
			throw new IllegalStateException("The seed script is missing: " + shipped);

		Path scripts = work.resolve("scripts");
		Path rows = scripts.resolve("dashboards-demo-data");
		Files.createDirectories(rows);

		Path script = scripts.resolve("dashboards-demo-data.groovy");
		Files.copy(shipped.resolve("dashboards-demo-data.groovy"), script,
				StandardCopyOption.REPLACE_EXISTING);
		try (Stream<Path> files = Files.list(shipped.resolve("dashboards-demo-data"))) {
			for (Path file : files.toList())
				Files.copy(file, rows.resolve(file.getFileName()), StandardCopyOption.REPLACE_EXISTING);
		}
		return script;
	}

	/** The one connection of the seeded database, handed over so a handle cannot close it. */
	static Connection notClosing(Connection connection) {
		return (Connection) java.lang.reflect.Proxy.newProxyInstance(
				DashboardDemos.class.getClassLoader(), new Class<?>[] { Connection.class },
				(proxy, method, arguments) -> {
					if ("close".equals(method.getName()))
						return null;
					try {
						return method.invoke(connection, arguments);
					} catch (java.lang.reflect.InvocationTargetException wrapped) {
						throw wrapped.getCause();
					}
				});
	}

	/** One number, asked of the frozen rows. */
	static Double number(Connection connection, String sql) throws Exception {
		try (java.sql.Statement statement = connection.createStatement();
				java.sql.ResultSet answer = statement.executeQuery(sql)) {
			if (!answer.next())
				return null;
			Object value = answer.getObject(1);
			return value == null ? null : ((Number) value).doubleValue();
		}
	}
}
