package com.flowkraft.generatedsql;

import static org.junit.jupiter.api.Assertions.fail;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.cubes.CubeSqlGenerator;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;
import com.sourcekraft.documentburster.common.db.SeedScriptRunner;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;

/**
 * The SQL the cube generator writes for a vendor RUNS on that vendor, and comes back with the
 * right answer.
 *
 * <p>CubeSqlGeneratorTest asserts on the SQL text and CubeSampleSqlExecutesTest runs it on SQLite
 * and DuckDB. Neither can see the SQL that renders beautifully and is a syntax error on Oracle, or
 * the LEFT JOIN that quietly answers 0 instead of NULL on ClickHouse. This test generates each
 * written Cube Story's query for one vendor, runs it on a throwaway database of that vendor seeded
 * with the same demo data, and compares the rows with the story's checks file - the one place the
 * truths live, which the page's e2e reads too.
 *
 * <p><b>Which vendors run</b> comes from the system property {@code generatedSql.vendors}:
 * <ul>
 * <li>not set: {@code sqlite,duckdb}. Both run in-process, take seconds and need no Docker, so
 * every {@code mvn test} checks every story's truths against the generator;
 * <li>{@code all}: the nine vendors below. {@code supabase} and {@code timescaledb} produce
 * postgres's SQL, so they are not looped separately;
 * <li>a comma list ({@code oracle,db2}): only those, to rerun one vendor after a fix.
 * </ul>
 * The seven container vendors run only on demand, one at a time - Db2, SQL Server and Oracle each
 * want gigabytes. How to run them: "Where things are", <b>Vendor loop</b>.
 *
 * <p><b>The samples (stories 10, 12, 14, 15 and 20) are not looped.</b> They are written for
 * Northwind, and the other engines' Northwind is built by JPA with quoted, case-exact names, so
 * they would fail there for reasons that have nothing to do with the generator. They stay on the
 * database they ship on, in CubeSampleSqlExecutesTest and the e2e.
 *
 * <p>Every vendor runs even when one fails, and the failure message then carries one line per
 * failed check: vendor, story, check, the SQL, and the expected and actual rows.
 */
class GeneratedSqlAllVendorsTest {

	/** Resolved from {@code user.dir} (bkend/server), the way CubeSampleSqlExecutesTest does it. */
	private static final String SAMPLES_CUBES_DIR = "../../asbl/src/main/external-resources/db-template/config/samples-cubes";
	private static final String CHECKS_DIR = "../../frend/reporting/e2e/cube-stories";
	private static final String DB_TEMPLATE_DB = "../../asbl/src/main/external-resources/db-template/db";

	private static final String COMPOSE_PROJECT = "generated-sql-vendors";
	private static final String COMPOSE_OVERRIDE = "src/test/resources/generated-sql-vendors/vendors.override.yml";

	private static final List<String> EVERY_VENDOR = List.of("sqlite", "duckdb", "postgres", "mysql", "mariadb",
			"sqlserver", "oracle", "db2", "clickhouse");

	/** The two that need no container: a temp file each, opened in this JVM. */
	private static final List<String> IN_PROCESS = List.of("sqlite", "duckdb");

	private static final ObjectMapper JSON = new ObjectMapper();

	@TempDir
	Path tempDir;

	@Test
	void theGeneratedSqlRunsOnEveryVendorAndAnswersTheStoriesTruths() throws Exception {

		List<Story> stories = readStories();
		List<String> vendors = askedVendors();

		List<String> failures = new ArrayList<>();
		List<String> perVendor = new ArrayList<>();

		for (String vendor : vendors) {

			long started = System.currentTimeMillis();
			int checked = 0;
			int failed = 0;

			try {
				if (!IN_PROCESS.contains(vendor)) {
					composeUp(vendor);
				}
				try (Connection connection = open(vendor)) {
					seed(connection, vendor);
					for (Story story : stories) {
						for (Map<String, Object> check : story.checks) {
							checked++;
							String problem = runCheck(connection, vendor, story, check);
							if (problem != null) {
								failed++;
								failures.add(problem);
							}
						}
					}
				}
			} catch (Exception unreachable) {
				// One vendor that never starts must not hide the other eight.
				failed++;
				failures.add("\n=== " + vendor + " | - | - ===\n  " + vendor + " never ran: " + unreachable);
			} finally {
				if (!IN_PROCESS.contains(vendor)) {
					composeDown();
				}
			}

			perVendor.add(String.format("%-12s %2d stories, %3d checks, %d failed, %d s", vendor, stories.size(),
					checked, failed, (System.currentTimeMillis() - started) / 1000));
		}

		System.out.println("\n=== generated SQL, run on every asked vendor ===");
		perVendor.forEach(System.out::println);

		if (!failures.isEmpty()) {
			StringBuilder message = new StringBuilder(
					"The generated SQL did not answer the stories' truths (" + failures.size() + " checks):\n");
			perVendor.forEach(line -> message.append(line).append("\n"));
			failures.forEach(failure -> message.append(failure).append("\n"));
			fail(message.toString());
		}
	}

	// ── the stories ──────────────────────────────────────────────────────────────

	/** One written story: its cube DSL as shipped, and the checks file that holds its truths. */
	private static final class Story {

		private final String id;
		private final String checksFile;
		private final CubeOptions file;
		private final List<Map<String, Object>> checks;

		private Story(String id, String checksFile, CubeOptions file, List<Map<String, Object>> checks) {
			this.id = id;
			this.checksFile = checksFile;
			this.file = file;
			this.checks = checks;
		}
	}

	/**
	 * The written stories, in ladder order: every {@code <nn>-<id>.checks.json} whose id is not a
	 * sample, with the cube of the same id. A missing folder or a story cube with no checks file
	 * fails the test - a vendor loop that quietly swept nothing would be worse than no loop.
	 */
	private List<Story> readStories() throws Exception {

		File checksDir = existing(CHECKS_DIR, "the stories' checks");
		File cubesDir = existing(SAMPLES_CUBES_DIR, "the shipped sample cubes");

		String[] names = checksDir.list((dir, name) -> name.endsWith(".checks.json"));
		if (names == null || names.length == 0) {
			throw new IllegalStateException("No *.checks.json in " + checksDir.getAbsolutePath());
		}
		Arrays.sort(names);

		List<Story> stories = new ArrayList<>();
		for (String name : names) {
			String id = name.substring(name.indexOf('-') + 1, name.length() - ".checks.json".length());
			if (id.startsWith("sample-")) continue;

			File config = new File(cubesDir, "story-" + id + "/story-" + id + "-cube-config.groovy");
			if (!config.exists()) {
				throw new IllegalStateException(name + " has no cube: " + config.getAbsolutePath());
			}
			List<Map<String, Object>> checks = JSON.readValue(new File(checksDir, name),
					new TypeReference<List<Map<String, Object>>>() {
					});
			stories.add(new Story(id, name,
					CubeOptionsParser.parseGroovyCubeDslCode(Files.readString(config.toPath())), checks));
		}

		String[] storyCubes = cubesDir.list((dir, name) -> name.startsWith("story-"));
		int shipped = storyCubes == null ? 0 : storyCubes.length;
		if (stories.size() != shipped) {
			throw new IllegalStateException(shipped + " story cubes ship, but " + stories.size()
					+ " have a checks file in " + checksDir.getAbsolutePath()
					+ ". Every written story carries its truths, so one without them is a mistake, not a skip.");
		}
		return stories;
	}

	private static File existing(String relative, String what) {
		File folder = new File(relative);
		if (!folder.isDirectory()) {
			throw new IllegalStateException(
					"The vendor loop cannot find " + what + ": " + folder.getAbsolutePath() + " is not a folder.");
		}
		return folder;
	}

	// ── one check ────────────────────────────────────────────────────────────────

	/** Returns null when the check passes, otherwise the one line that says what went wrong. */
	private String runCheck(Connection connection, String vendor, Story story, Map<String, Object> check) {

		Object refusedOn = check.get("refusedOn");
		boolean mustRefuse = refusedOn instanceof List && ((List<?>) refusedOn).contains(vendor);

		String sql;
		try {
			// The same two calls the generate-sql endpoint makes with dbVendor.
			CubeOptions cube = CubeSqlGenerator.pickCube(story.file, Objects.toString(check.get("cube"), ""));
			sql = CubeSqlGenerator.buildQuery(cube, check, vendor).toInlineSql(vendor);
		} catch (IllegalArgumentException refusal) {
			// IllegalArgumentException is what the endpoint answers as a 400.
			if (mustRefuse) return null;
			return report(vendor, story, check, "-", "generate-sql refused it: " + refusal.getMessage());
		}

		if (mustRefuse) {
			return report(vendor, story, check, sql,
					"generate-sql was expected to refuse this on " + vendor + ", and generated SQL instead");
		}

		List<List<Object>> actual;
		try {
			actual = rows(connection, sql);
		} catch (Exception broken) {
			return report(vendor, story, check, sql, "the database refused it: " + broken);
		}

		@SuppressWarnings("unchecked")
		List<List<Object>> expected = (List<List<Object>>) check.get("rows");
		String difference = difference(expected, actual, Boolean.TRUE.equals(check.get("ordered")));
		return difference == null ? null : report(vendor, story, check, sql, difference);
	}

	private String report(String vendor, Story story, Map<String, Object> check, String sql, String problem) {
		Map<String, Object> asked = new LinkedHashMap<>(check);
		asked.remove("rows");
		return "\n=== " + vendor + " | " + story.checksFile + " | " + asked + " ===\n  " + problem + "\n  SQL: " + sql;
	}

	private static List<List<Object>> rows(Connection connection, String sql) throws Exception {
		List<List<Object>> rows = new ArrayList<>();
		try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery(sql)) {
			int columns = result.getMetaData().getColumnCount();
			while (result.next()) {
				List<Object> row = new ArrayList<>();
				for (int column = 1; column <= columns; column++) {
					row.add(result.getObject(column));
				}
				rows.add(row);
			}
		}
		return rows;
	}

	// ── comparing rows, by the e2e's rules ───────────────────────────────────────

	/**
	 * The e2e's rules: numbers within 0.01, dates by their {@code YYYY-MM-DD} start, NULL as NULL,
	 * and as a set unless the check says {@code ordered} - the order is the answer only where the
	 * story is about it (story 7, and every check that asks for an order and a limit).
	 */
	private static String difference(List<List<Object>> expected, List<List<Object>> actual, boolean ordered) {

		if (expected.size() != actual.size()) {
			return "expected " + expected.size() + " rows, got " + actual.size() + sideBySide(expected, actual);
		}

		if (ordered) {
			for (int i = 0; i < expected.size(); i++) {
				if (!sameRow(expected.get(i), actual.get(i))) {
					return "row " + (i + 1) + " differs, and this check is ordered" + sideBySide(expected, actual);
				}
			}
			return null;
		}

		List<List<Object>> unmatched = new ArrayList<>(actual);
		for (List<Object> want : expected) {
			boolean found = false;
			for (Iterator<List<Object>> left = unmatched.iterator(); left.hasNext();) {
				if (sameRow(want, left.next())) {
					left.remove();
					found = true;
					break;
				}
			}
			if (!found) return "no row answers " + want + sideBySide(expected, actual);
		}
		return null;
	}

	private static boolean sameRow(List<Object> expected, List<Object> actual) {
		if (expected == null || actual == null || expected.size() != actual.size()) return false;
		for (int i = 0; i < expected.size(); i++) {
			if (!same(normalise(expected.get(i)), normalise(actual.get(i)))) return false;
		}
		return true;
	}

	private static boolean same(Object expected, Object actual) {
		if (expected == null || actual == null) return expected == actual;
		Double left = asNumber(expected);
		Double right = asNumber(actual);
		if (left != null && right != null) return Math.abs(left - right) <= 0.01;
		return expected.toString().equals(actual.toString());
	}

	/**
	 * A value as the comparison sees it: a number stays a number, a date becomes the
	 * {@code YYYY-MM-DD} it starts with - whether the driver hands back a Date, a Timestamp, a
	 * LocalDate or the text of one - and a boolean becomes 1 or 0, which is what the other engines
	 * store for it.
	 */
	private static Object normalise(Object value) {
		if (value == null) return null;
		if (value instanceof Number) return ((Number) value).doubleValue();
		if (value instanceof Boolean) return ((Boolean) value) ? 1.0d : 0.0d;
		String text = value.toString();
		if (text.length() >= 10 && text.charAt(4) == '-' && text.charAt(7) == '-'
				&& Character.isDigit(text.charAt(0)) && Character.isDigit(text.charAt(9))) {
			return text.substring(0, 10);
		}
		return text;
	}

	private static Double asNumber(Object value) {
		if (value instanceof Number) return ((Number) value).doubleValue();
		try {
			return Double.valueOf(value.toString());
		} catch (NumberFormatException notANumber) {
			return null;
		}
	}

	private static String sideBySide(List<List<Object>> expected, List<List<Object>> actual) {
		return "\n  expected: " + show(expected) + "\n  actual:   " + show(actual);
	}

	private static String show(List<List<Object>> rows) {
		if (rows.isEmpty()) return "no rows";
		StringBuilder shown = new StringBuilder();
		for (int i = 0; i < Math.min(10, rows.size()); i++) {
			shown.append(i == 0 ? "" : ", ").append(rows.get(i));
		}
		if (rows.size() > 10) shown.append(", … (").append(rows.size()).append(" rows)");
		return shown.toString();
	}

	// ── the databases ────────────────────────────────────────────────────────────

	private List<String> askedVendors() {
		String asked = System.getProperty("generatedSql.vendors", "").trim();
		if (asked.isEmpty()) return IN_PROCESS;
		if ("all".equalsIgnoreCase(asked)) return EVERY_VENDOR;

		List<String> wanted = new ArrayList<>();
		for (String one : asked.split(",")) {
			String vendor = one.trim().toLowerCase(Locale.ROOT);
			if (vendor.isEmpty()) continue;
			if (!EVERY_VENDOR.contains(vendor)) {
				throw new IllegalArgumentException("generatedSql.vendors names '" + vendor
						+ "', which this loop does not know. It runs: " + EVERY_VENDOR + ", or 'all'.");
			}
			wanted.add(vendor);
		}
		return wanted;
	}

	/**
	 * A throwaway database of this vendor.
	 *
	 * <p>SQLite and DuckDB get a copy of the SHIPPED sample - the NorthwindFixture files, built the
	 * way the packager builds them - so the one connection sees Northwind and {@code cube_demo}
	 * together, exactly as a customer's does. The other seven answer on the compose network, by
	 * service name and container port, with the user, password and database of that service's env
	 * in the product compose file. MySQL, MariaDB and Oracle are opened as the administrator,
	 * because the seed creates a database or a user there.
	 */
	private Connection open(String vendor) throws Exception {

		switch (vendor) {
			case "duckdb":
				return DriverManager.getConnection("jdbc:duckdb:"
						+ NorthwindFixture.writableCopy(tempDir.resolve("northwind.duckdb")).toAbsolutePath());
			case "sqlite": {
				Path main = NorthwindFixture.writableSqliteCopy(tempDir.resolve("northwind.db"));
				Connection connection = DriverManager
						.getConnection("jdbc:sqlite:" + main.toAbsolutePath().toString().replace("\\", "/"));
				// SQLite has no schemas, so cube_demo is a second file attached to this one
				// connection - what the seed script asks for, and what the shipped sample does.
				try (Statement statement = connection.createStatement()) {
					statement.execute("ATTACH DATABASE '"
							+ tempDir.resolve("cube-demo.db").toAbsolutePath().toString().replace("\\", "/")
							+ "' AS cube_demo");
				}
				return connection;
			}
			default:
				return connect(vendor);
		}
	}

	private Connection connect(String vendor) throws Exception {

		Map<String, String> env = composeEnv();
		String url;
		String user;
		String password;

		switch (vendor) {
			case "postgres":
				url = "jdbc:postgresql://postgres:5432/" + env.getOrDefault("POSTGRES_DB", "northwind");
				user = env.getOrDefault("POSTGRES_USER", "postgres");
				password = env.get("POSTGRES_PASSWORD");
				break;
			case "mysql":
				url = "jdbc:mysql://mysql:3306/" + env.getOrDefault("MYSQL_DB", "northwind")
						+ "?allowPublicKeyRetrieval=true&useSSL=false";
				user = "root";
				password = env.get("MYSQL_PASSWORD");
				break;
			case "mariadb":
				url = "jdbc:mariadb://mariadb:3306/" + env.getOrDefault("MARIADB_DB", "northwind");
				user = "root";
				password = env.get("MARIADB_PASSWORD");
				break;
			case "sqlserver":
				url = "jdbc:sqlserver://sqlserver:1433;databaseName="
						+ env.getOrDefault("SQLSERVER_DB", "Northwind") + ";encrypt=false;trustServerCertificate=true";
				user = "sa";
				password = env.get("SQLSERVER_PASSWORD");
				break;
			case "oracle":
				url = "jdbc:oracle:thin:@//oracle:1521/XEPDB1";
				user = "SYSTEM";
				password = env.getOrDefault("ORACLE_PASSWORD", "oracle");
				break;
			case "db2":
				url = "jdbc:db2://db2:50000/" + env.getOrDefault("DB2_DB", "NORTHWND");
				user = env.getOrDefault("DB2_USER", "db2inst1");
				password = env.get("DB2_PASSWORD");
				break;
			case "clickhouse":
				url = "jdbc:ch://clickhouse:8123/" + env.getOrDefault("CLICKHOUSE_DB", "northwind");
				user = env.getOrDefault("CLICKHOUSE_USER", "default");
				password = env.getOrDefault("CLICKHOUSE_PASSWORD", "clickhouse");
				break;
			default:
				throw new IllegalStateException("No database for vendor '" + vendor + "'.");
		}

		// The container is healthy by now, but a database that has just answered its healthcheck
		// can still refuse the first JDBC connection while it finishes opening.
		Exception last = null;
		for (int attempt = 1; attempt <= 30; attempt++) {
			try {
				return DriverManager.getConnection(url, user, password);
			} catch (Exception notYet) {
				last = notYet;
				Thread.sleep(5000);
			}
		}
		throw new IllegalStateException(vendor + " never took a connection on " + url, last);
	}

	/**
	 * The product compose file's own {@code .env}: the user, password and database each service
	 * runs with. Read, never printed - the failure messages carry the SQL and the rows, not a URL.
	 */
	private static Map<String, String> composeEnv() throws Exception {
		Path file = Paths.get(DB_TEMPLATE_DB, ".env");
		if (!Files.exists(file)) {
			throw new IllegalStateException("The compose file's .env is missing: " + file.toAbsolutePath());
		}
		Map<String, String> env = new LinkedHashMap<>();
		for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
			String trimmed = line.trim();
			if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
			int equals = trimmed.indexOf('=');
			if (equals <= 0) continue;
			env.put(trimmed.substring(0, equals).trim(), trimmed.substring(equals + 1).trim());
		}
		return env;
	}

	/**
	 * The demo data, from the script the product ships and the packager runs.
	 *
	 * <p>DuckDB is the one vendor that needs no seeding here: the shipped sample already carries
	 * the {@code cube_demo} schema, and this leg runs on a copy of it.
	 */
	private void seed(Connection connection, String vendor) throws Exception {
		if ("duckdb".equals(vendor)) return;

		Path script = Paths.get(DB_TEMPLATE_DB, "scripts", "cube-demo-data.groovy");
		if (!Files.exists(script)) {
			throw new IllegalStateException("The seed script is missing: " + script.toAbsolutePath());
		}
		SeedScriptRunner.run(connection, vendor.toUpperCase(Locale.ROOT), script, Map.of());
	}

	// ── the containers ───────────────────────────────────────────────────────────

	private void composeUp(String vendor) throws Exception {
		docker("compose", "-p", COMPOSE_PROJECT, "-f", composeFile(), "-f", overrideFile(), "up", "-d", "--wait",
				"--wait-timeout", "900", vendor);
	}

	/** {@code down -v}: the container and its volumes are gone before the next vendor starts. */
	private void composeDown() {
		try {
			docker("compose", "-p", COMPOSE_PROJECT, "-f", composeFile(), "-f", overrideFile(), "down", "-v");
		} catch (Exception alreadyGone) {
			System.out.println("compose down said: " + alreadyGone.getMessage());
		}
	}

	private static String composeFile() {
		return Paths.get(DB_TEMPLATE_DB, "docker-compose.yml").toAbsolutePath().toString();
	}

	private static String overrideFile() {
		return Paths.get(COMPOSE_OVERRIDE).toAbsolutePath().toString();
	}

	private static void docker(String... arguments) throws Exception {
		List<String> command = new ArrayList<>();
		command.add("docker");
		command.addAll(Arrays.asList(arguments));

		Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
		String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
		int code = process.waitFor();

		System.out.println("$ docker " + String.join(" ", arguments));
		System.out.println(output);
		if (code != 0) {
			throw new IllegalStateException("docker " + String.join(" ", arguments) + " failed (" + code + "):\n"
					+ output);
		}
	}
}
