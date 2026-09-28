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
import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.jdbi.v3.core.Jdbi;
import org.springframework.test.util.ReflectionTestUtils;

import com.flowkraft.queries.services.QueriesService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.common.AppPaths;
import com.flowkraft.cubes.CubeFilterOptions;
import com.flowkraft.cubes.CubeFiles;
import com.flowkraft.cubes.CubeRuntimeService;
import com.flowkraft.cubes.CubeSqlGenerator;
import com.flowkraft.cubes.CubeWidgets;
import com.flowkraft.cubes.CubesService;
import com.flowkraft.exploredata.export.DashboardFileGenerator;
import com.flowkraft.exploredata.export.ScriptAssembler;
import com.flowkraft.iam.limits.LimitsSandbox;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindManager.DatabaseVendor;
import com.sourcekraft.documentburster.common.db.SeedScriptRunner;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindManager;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;

/**
 * The SQL the cube generator writes for a vendor RUNS on that vendor, and comes back with the
 * right answer.
 *
 * <p>CubeSqlGeneratorTest asserts on the SQL text and CubeSampleSqlExecutesTest runs it on SQLite
 * and DuckDB. Neither can see the SQL that renders beautifully and is a syntax error on Oracle, or
 * the LEFT JOIN that quietly answers 0 instead of NULL on ClickHouse. This test generates each
 * cube hint's query for one vendor, runs it on a throwaway database of that vendor seeded with the
 * same demo data, and compares the rows with that hint's check.
 *
 * <p>A hint is a question a shipped cube already knows how to answer: it lives beside the cube, in
 * its hints file ({@code <cube>/hints.json}, or {@code <domain>/<cube>-hints.json} where a domain
 * folder holds several cubes - {@link CubeFiles} says which), and the page offers it to the user. Its truths live in
 * {@code e2e/_resources/cube-checks/<cube>.checks.json}, one {@code {hint, rows}} per hint (and per
 * variant), which the page's e2e reads too. {@link #readAsks} pairs the two and refuses a cube with
 * no hints, a hint with no check, a check naming no hint, and two checks for one hint - so a
 * question can neither go unchecked nor be checked twice.
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
 * <p><b>The Northwind samples are looped too.</b> Northwind ships on every vendor the product
 * supports, so the loop loads it into each throwaway database through the product's own path -
 * {@code NorthwindManager.initializeDatabaseWithGenerator}, which is JPA plus
 * {@code NorthwindDataGenerator} on the server vendors and the warehouse creators on DuckDB and
 * ClickHouse. Never a second loader: every copy comes from the same generator, so one hint's rows
 * hold on every database. The two legs that need no container (SQLite, DuckDB) keep using copies
 * of the shipped sample files, which already carry Northwind.
 *
 * <p>Two samples cannot run everywhere, and {@link #whyNot} says so in one line rather than
 * skipping quietly: {@code northwind-warehouse} reads {@code vw_sales_detail}, the star schema,
 * which only the DuckDB and ClickHouse creators build; and {@code northwind-sales} reads
 * {@code Order Details}, which ClickHouse's Northwind names {@code OrderDetails}. Every such
 * exception is printed with the run summary.
 *
 * <p><b>AI Hub's own SQL is looped here too.</b> The same throwaway database answers the AI Hub
 * cases of {@code frend/reporting/e2e/_resources/ai-hub-sql/ai-hub-sql-cases.json}, run from the
 * SQL its generator wrote for each vendor and committed in {@code ai-hub-sql.generated.json}.
 * Group A names every table {@code cube_demo.<table>} and runs on all nine vendors, so the loop is
 * itself the proof that AI Hub reaches a schema outside the default one; groups B and C read
 * Northwind and the star schema by their bare names and run on the two legs that have them, group C
 * through the one connection that sees both schemas. Nothing here builds SQL: the generator is
 * TypeScript, which is also how production splits it - AI Hub builds the SQL, the backend runs it.
 *
 * <p>Every vendor runs even when one fails, and the failure message then carries one line per
 * failed check: vendor, cube, hint, the query, the SQL, and the expected and actual rows.
 */
class GeneratedSqlAllVendorsTest {

	/** Resolved from {@code user.dir} (bkend/server), the way CubeSampleSqlExecutesTest does it. */
	private static final String SAMPLES_CUBES_DIR = "../../asbl/src/main/external-resources/db-template/config/samples-cubes";
	private static final String CHECKS_DIR = "../../frend/reporting/e2e/_resources/cube-checks";
	private static final String AI_HUB_CASES = "../../frend/reporting/e2e/_resources/ai-hub-sql/ai-hub-sql-cases.json";
	private static final String AI_HUB_SQL = "../../frend/reporting/e2e/_resources/ai-hub-sql/ai-hub-sql.generated.json";

	/** How the committed per-vendor SQL is written again, named by every complaint about it. */
	private static final String WRITE_AI_HUB_SQL = "Write it again with: docker run --rm -v <repo>:/x"
			+ " -w /x/frend/reporting node:20-slim npx ts-node -r tsconfig-paths/register"
			+ " --project e2e/tsconfig.e2e.json e2e/explore-data/write-ai-hub-sql.ts";
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

	/** {@code {caseId: {vendor: sql}}}, read once by {@link #readAiHubCases()}. */
	private Map<String, Map<String, String>> aiHubSql = Map.of();

	@Test
	void theGeneratedSqlRunsOnEveryVendorAndAnswersTheHintsTruths() throws Exception {

		List<Ask> asks = readAsks();
		List<AiHubCase> aiHubCases = readAiHubCases();
		List<String> vendors = askedVendors();

		List<String> failures = new ArrayList<>();
		List<String> perVendor = new ArrayList<>();
		List<String> notAsked = new ArrayList<>();

		for (String vendor : vendors) {

			long started = System.currentTimeMillis();
			int checked = 0;
			int failed = 0;
			int casesChecked = 0;
			int casesFailed = 0;
			int viewersChecked = 0;
			int viewersFailed = 0;
			int parityChecked = 0;
			int parityFailed = 0;
			filteredPasses = 0;

			try {
				if (!IN_PROCESS.contains(vendor)) {
					composeUp(vendor);
				}
				try (Connection connection = open(vendor)) {
					seed(connection, vendor);
					for (Ask ask : asks) {
						String why = whyNot(ask.cube, vendor);
						if (why != null) {
							String line = vendor + " | " + ask.cube + ": " + why;
							if (!notAsked.contains(line)) notAsked.add(line);
							continue;
						}
						checked++;
						String problem = runCheck(connection, vendor, ask);
						if (problem != null) {
							failed++;
							failures.add(problem);
						}

						// The same selection, published both ways, on this same database.
						parityChecked++;
						List<String> disagreements = runParity(connection, vendor, ask, parityChecked, notAsked);
						if (!disagreements.isEmpty()) {
							parityFailed++;
							failures.addAll(disagreements);
						}
					}

					// AI Hub's own SQL, on the same database, after the stories.
					Jdbi jdbi = jdbiOn(connection);
					for (AiHubCase one : aiHubCases) {
						String why = whyNotAiHub(one, vendor);
						if (why != null) {
							String line = vendor + " | AI Hub " + one.id + ": " + why;
							if (!notAsked.contains(line)) notAsked.add(line);
							continue;
						}
						casesChecked++;
						String problem = runAiHubCase(jdbi, vendor, one);
						if (problem != null) {
							casesFailed++;
							failures.add(problem);
						}
					}

					// And the one condition a request cannot leave out, bound for each viewer.
					for (String problem : runAccessFilterViewers(jdbi, vendor)) {
						viewersChecked++;
						if (problem != null) {
							viewersFailed++;
							failures.add(problem);
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

			perVendor.add(String.format(
					"%-12s %3d hint checks, %d failed | %2d AI Hub cases, %d failed | %d access filter viewers, %d failed"
							+ " | %3d two-mode checks (%d with a chip), %d failed | %d s",
					vendor, checked, failed, casesChecked, casesFailed, viewersChecked, viewersFailed,
					parityChecked, filteredPasses, parityFailed,
					(System.currentTimeMillis() - started) / 1000));
		}

		System.out.println("\n=== generated SQL, run on every asked vendor ===");
		perVendor.forEach(System.out::println);
		if (!notAsked.isEmpty()) {
			System.out.println("--- not asked, and why (never a silent skip) ---");
			notAsked.forEach(System.out::println);
		}

		if (!failures.isEmpty()) {
			StringBuilder message = new StringBuilder(
					"The generated SQL did not answer the truths behind it (" + failures.size() + " checks):\n");
			perVendor.forEach(line -> message.append(line).append("\n"));
			notAsked.forEach(line -> message.append(line).append("\n"));
			failures.forEach(failure -> message.append(failure).append("\n"));
			fail(message.toString());
		}
	}

	/**
	 * The hints and their checks answer each other, and every hint names fields its cube has.
	 *
	 * <p>This one needs no database: it reads every shipped cube's hints and its
	 * {@code <cube>.checks.json} next to the e2e, pairs them, and generates the SQL for every hint.
	 * A hint with no check, a check with no hint, or a hint naming a field the cube does not have
	 * fails here, on every {@code mvn test}, rather than on the vendor the loop happens to start.
	 */
	@Test
	void everyHintCarriesItsTruthsAndNamesOnlyItsCubesFields() throws Exception {

		List<String> complaints = new ArrayList<>();
		for (Ask ask : readAsks()) {
			if (ask.refusedEverywhere()) continue;
			try {
				CubeSqlGenerator.buildQuery(CubeSqlGenerator.pickCube(ask.file, ask.cubeKey()), ask.query, "duckdb");
			} catch (Exception refused) {
				complaints.add(ask.cube + " | " + ask.hint + ": " + refused.getMessage());
			}
		}
		if (!complaints.isEmpty()) {
			fail("A hint asks its cube for something it has not got:\n" + String.join("\n", complaints));
		}
	}

	// ── the access filter, bound, for a viewer ─────────────────────────

	/**
	 * A cube's {@code access_filter}, written the way an author writes one, naming every builtin.
	 *
	 * <p>Read it as the rule the support desk would actually have: you see the tickets you own, by
	 * the name you sign in with or by your email, or the tickets of a team you are in; the strategic
	 * accounts are for report authors; the host portal's viewer is pinned to one account; and nothing
	 * after today, in this tenant. The demo data has no column holding a sign-in name, so the agent's
	 * name stands in for one here - Phase 4's story 31 joins on the email, which the data does have.
	 *
	 * <p>It is one line on purpose. The condition travels through {@code SqlParameterLines}, which
	 * reads the SQL a line at a time, and a condition split over several lines would be several
	 * lines to it.
	 *
	 * <p>Two things an author learns from the databases here, and only from them. First: a builtin
	 * is bound as text (only {@code dp_today} and {@code dp_now} are typed), so it is compared with
	 * a text column - {@code crm_accounts.name}, not {@code crm_accounts.account_id}. Postgres
	 * refuses {@code integer = character varying} outright, and no cast helps, because a cast that
	 * is right on one vendor is wrong on the next and a cube may not name a vendor (THE RULE).
	 * Second: a builtin compared with a literal is typed FROM that literal on DB2, so a value longer
	 * than the literal overflows it ({@code SQLCODE=-302}); the tenant codes here are therefore no
	 * longer than {@code 'cube-demo'}, and an installation with longer ones compares the builtin
	 * with a column instead.
	 */
	private static final String ACCESS_FILTER = "(cube_demo.support_agents.email = ${dp_user_email}"
			+ " OR cube_demo.support_agents.name = ${dp_user_id}"
			+ " OR cube_demo.support_agents.team IN (${dp_user_groups}))"
			+ " AND (cube_demo.crm_accounts.account_tier <> 'Strategic' OR ${dp_user_role} = 'report_author')"
			+ " AND cube_demo.crm_accounts.name = ${dp_attr_customer_id}"
			+ " AND ${CUBE}.opened_date <= ${dp_today}"
			+ " AND ${dp_tenant_id} = 'cube-demo'";

	/** {@code dp_today} is a date, and a date bound as text is the wrong rows on SQLite and an error on Postgres. */
	private static final Map<String, String> ACCESS_FILTER_TYPES = Map.of("dp_today", "Date");

	private static final String SUPPORT_DESK = "customer-support/support-desk-cube-config.groovy";

	/** One person asking, and the rows the filter leaves them. */
	private static final class Viewer {

		private final String who;
		private final Map<String, Object> values;
		private final List<List<Object>> rows;

		private Viewer(String who, Map<String, Object> values, List<List<Object>> rows) {
			this.who = who;
			this.values = values;
			this.rows = rows;
		}
	}

	/** The values {@code UserVariables} would hand over for this person, as it hands them over: text. */
	private static Map<String, Object> asking(String id, String email, String groups, String role, String tenant,
			String customer, String today) {
		Map<String, Object> values = new LinkedHashMap<>();
		values.put("dp_user_id", id);
		values.put("dp_user_email", email);
		values.put("dp_user_groups", groups);
		values.put("dp_user_role", role);
		values.put("dp_tenant_id", tenant);
		values.put("dp_attr_customer_id", customer);
		values.put("dp_today", today);
		return values;
	}

	private static final String CHIARA = "chiara.muller@support.cube-demo.example";
	/** The account the host portal pins its viewer to: a name with an apostrophe in it, bound. */
	private static final String MUNSONS = "Munson's Pickles Sp. z o.o.";
	private static final String PARNELL = "Parnell Aerospace SARL";
	private static final String ORGANICS = "Best For You Organics Ltd";
	private static final String NOBODY = "nobody@support.cube-demo.example";
	private static final String TODAY = "2026-09-30";

	/**
	 * Seven people asking the same cube the same question, and getting seven different answers -
	 * each one the rows the condition leaves them, on the frozen demo data.
	 */
	private static final List<Viewer> VIEWERS = List.of(
			new Viewer("the agent, found by her email",
					asking("-", CHIARA, "", "report_viewer", "cube-demo", MUNSONS, TODAY),
					List.of(List.of("Chiara Muller", "Tier 2", MUNSONS, "Enterprise", 13))),
			new Viewer("the same agent, asking as if it were June 2025 - the date binds as a date",
					asking("-", CHIARA, "", "report_viewer", "cube-demo", MUNSONS, "2025-06-30"),
					List.of(List.of("Chiara Muller", "Tier 2", MUNSONS, "Enterprise", 1))),
			new Viewer("another agent, found by the name he signs in with, on another account",
					asking("Milan Muller", NOBODY, "", "report_viewer", "cube-demo", ORGANICS, TODAY),
					List.of(List.of("Milan Muller", "Tier 2", ORGANICS, "Enterprise", 14))),
			new Viewer("a viewer on a strategic account: her own tickets, and not one row of them",
					asking("-", CHIARA, "", "report_viewer", "cube-demo", PARNELL, TODAY),
					List.of()),
			new Viewer("the same person as a report author: the same account answers",
					asking("-", CHIARA, "", "report_author", "cube-demo", PARNELL, TODAY),
					List.of(List.of("Chiara Muller", "Tier 2", PARNELL, "Strategic", 16))),
			new Viewer("somebody nobody knows, in two groups: the teams' tickets, apostrophe and all",
					asking("-", NOBODY, "Billing,Tier 2", "report_viewer", "cube-demo", MUNSONS, TODAY),
					List.of(List.of("Chiara Muller", "Tier 2", MUNSONS, "Enterprise", 13),
							List.of("Fatima Vargas", "Tier 2", MUNSONS, "Enterprise", 12),
							List.of("Felix Silva", "Tier 2", MUNSONS, "Enterprise", 10),
							List.of("Henrik Silva", "Billing", MUNSONS, "Enterprise", 4),
							List.of("Jonas Berg", "Billing", MUNSONS, "Enterprise", 9),
							List.of("Lukas O'Connor", "Billing", MUNSONS, "Enterprise", 9),
							List.of("Milan Muller", "Tier 2", MUNSONS, "Enterprise", 5))),
			new Viewer("the same agent in another tenant: nothing",
					asking("-", CHIARA, "", "report_viewer", "other-co", MUNSONS, TODAY),
					List.of()));

	/** Agent, team, account and its tier, with the tickets counted: enough to see whose rows came back. */
	private static Map<String, Object> accessFilterRequest() {
		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("Agent", "Team", "Account", "AccountTier"));
		request.put("measures", List.of("Tickets"));
		return request;
	}

	/**
	 * The shipped Support Desk cube, with an access filter on it, asked by each viewer in turn.
	 *
	 * <p>Generated once per vendor and bound seven times, because that is the shape of the promise:
	 * the SQL a cube generates says nothing about who is asking - it carries {@code ${dp_…}} on to
	 * whoever runs it - and the rows it comes back with are that person's and nobody else's. Only a
	 * real database can show that. Bound as text, {@code opened_date <= '2025-06-30'} answers every
	 * row on some vendors and is an error on others; the apostrophe in an agent's name is a syntax
	 * error the moment a value is pasted into the text instead of bound; and a condition whose
	 * brackets the generator forgot hands the strategic account to the viewer who may not see it.
	 *
	 * <p>The filter is set on the parsed cube rather than written into the shipped file: Phase 4's
	 * story 31 puts the real one there, and this case must keep working when it does.
	 *
	 * @return one entry per viewer, null where that viewer's rows were right
	 */
	private List<String> runAccessFilterViewers(Jdbi jdbi, String vendor) {

		String generated;
		try {
			File config = new File(existing(SAMPLES_CUBES_DIR, "the shipped sample cubes"), SUPPORT_DESK);
			CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(Files.readString(config.toPath()));
			cube.setAccessFilter(ACCESS_FILTER);
			generated = CubeSqlGenerator.buildQuery(cube, accessFilterRequest(), vendor).toInlineSql(vendor);
		} catch (Exception broken) {
			return List.of("\n=== " + vendor + " | access filter | - ===\n  the SQL was not generated: " + broken);
		}

		if (!generated.contains("${dp_user_email}")) {
			return List.of("\n=== " + vendor + " | access filter | - ===\n  the generated SQL does not carry the"
					+ " builtin variables on to whoever runs it\n  SQL: " + generated);
		}

		List<String> answers = new ArrayList<>();
		for (Viewer viewer : VIEWERS) {
			answers.add(askAsViewer(jdbi, vendor, generated, viewer));
		}
		return answers;
	}

	/** One viewer's values bound the production way - {@code QueriesService.prepare}, then JDBI. */
	private String askAsViewer(Jdbi jdbi, String vendor, String generated, Viewer viewer) {

		QueriesService.PreparedSql prepared = QueriesService.prepare(generated, viewer.values, ACCESS_FILTER_TYPES);
		String sql = prepared.sql();
		Map<String, Object> binds = prepared.params() == null ? Map.of() : prepared.params();

		List<List<Object>> actual;
		try {
			actual = jdbi.withHandle(handle -> {
				org.jdbi.v3.core.statement.Query query = handle.createQuery(sql);
				for (Map.Entry<String, Object> bind : binds.entrySet()) {
					if (bind.getValue() instanceof List<?> list) {
						query.bindList(bind.getKey(), list);
					} else {
						query.bind(bind.getKey(), bind.getValue());
					}
				}
				return query.map((resultSet, context) -> {
					List<Object> row = new ArrayList<>();
					for (int column = 1; column <= resultSet.getMetaData().getColumnCount(); column++) {
						row.add(resultSet.getObject(column));
					}
					return row;
				}).list();
			});
		} catch (Exception broken) {
			return reportViewer(vendor, viewer, sql, "the database refused it: " + broken + " (parameters " + binds + ")");
		}

		String difference = difference(viewer.rows, actual, false);
		return difference == null ? null : reportViewer(vendor, viewer, sql, difference);
	}

	private String reportViewer(String vendor, Viewer viewer, String sql, String problem) {
		return "\n=== " + vendor + " | access filter | " + viewer.who + " ===\n  " + problem + "\n  asked with "
				+ viewer.values + "\n  SQL: " + sql;
	}

	// ── the hints ────────────────────────────────────────────────────────────────

	/** One hint (or one of its variants): the query it ticks, and the rows it must answer. */
	private static final class Ask {

		private final String cube;
		private final String hint;
		private final CubeOptions file;
		/** The DSL file itself: Mode 2 reads its cube from an installation, not from a parse. */
		private final File dslFile;
		private final String cubeName;
		private final Map<String, Object> query;
		private final List<List<Object>> rows;

		/**
		 * The vendors generate-sql is expected to REFUSE this question on, from the check - never
		 * from the hint. A hint ships with the cube and, like the cube, names no vendor (THE RULE);
		 * which database cannot answer it is a truth about that database, so it lives with the
		 * other truths, in the checks file.
		 */
		private final List<?> refusedOn;

		private Ask(String cube, String hint, CubeOptions file, File dslFile, String cubeName,
				Map<String, Object> query, List<List<Object>> rows, List<?> refusedOn) {
			this.cube = cube;
			this.hint = hint;
			this.file = file;
			this.dslFile = dslFile;
			this.cubeName = cubeName;
			this.query = query;
			this.rows = rows;
			this.refusedOn = refusedOn == null ? List.of() : refusedOn;
		}

		/**
		 * The cube inside the file this hint ticks: the one the hint names, else the cube's own name
		 * in its file, else the file's unnamed cube.
		 */
		private String cubeKey() {
			return Objects.toString(query.get("cubeName"), Objects.toString(cubeName, ""));
		}

		private boolean refusedOn(String vendor) {
			return refusedOn.contains(vendor);
		}

		/** A hint no vendor can generate is not a hint; nothing in the shipped files is one. */
		private boolean refusedEverywhere() {
			return refusedOn.containsAll(EVERY_VENDOR);
		}
	}

	/**
	 * Why a cube is not asked on a vendor, or null when it is. Only the two Northwind samples that
	 * cannot run everywhere answer with a reason; the cube_demo cubes are seeded on every vendor
	 * the loop starts, so they are always asked.
	 */
	private static String whyNot(String cube, String vendor) {
		if (!cube.startsWith("northwind-")) return null;
		if ("northwind-warehouse".equals(cube) && !List.of("duckdb", "clickhouse").contains(vendor)) {
			return "it reads vw_sales_detail, the star schema, which only the DuckDB and ClickHouse "
					+ "warehouse creators build";
		}
		if ("northwind-sales".equals(cube) && "clickhouse".equals(vendor)) {
			return "ClickHouse's Northwind names the table OrderDetails, not \"Order Details\"";
		}
		// A cube is written for the connection it is bound to - cube.xml names it, and for these four
		// it is the bundled SQLite Northwind, whose tables and columns JPA creates delimited and
		// mixed-case ("Customers", "Order Details", "Country"). So the cube names them the ANSI way,
		// which is also the only way that is right on PostgreSQL, Oracle, Db2, SQL Server, DuckDB and
		// ClickHouse. MySQL and MariaDB read " as a string, not as a delimiter, so the same cube
		// cannot be theirs - and the author's own SQL is not ours to rewrite to make it theirs. Six
		// of the nine answer a cube written for one of them, which is what a real author needs; the
		// other three come from the cube_demo cubes, whose schema is created undelimited and which
		// every vendor answers.
		if (List.of("mysql", "mariadb").contains(vendor)) {
			return "the cube names its tables and columns the ANSI way - \"Customers\", \"Order Details\" "
					+ "- because that is how its bundled SQLite Northwind creates them; MySQL and "
					+ "MariaDB do not read \" as an identifier delimiter";
		}
		return null;
	}

	/**
	 * Every hint of every shipped cube, paired with the rows its check holds.
	 *
	 * <p>The pairing is the tie between the two files: the cube's hints file ships
	 * with the cube and holds the question, the words and the query; the query lives there once, so
	 * it can never disagree with the text a user reads. {@code
	 * _resources/cube-checks/<cube>.checks.json} holds the truths -
	 * {@code hint} and its {@code rows}, plus, where there is one to say, the {@code source} SQL
	 * those rows were computed with and the {@code refusedOn} vendors that cannot answer the
	 * question at all. Everything that names a database stays on this side: a shipped hint names
	 * no vendor (THE RULE). A cube that ships without hints, a hint with no check, or a check naming a hint that is
	 * not there fails here - a vendor loop that quietly swept nothing would be worse than no loop.
	 */
	private List<Ask> readAsks() throws Exception {

		File checksDir = existing(CHECKS_DIR, "the cubes' checks");
		File cubesDir = existing(SAMPLES_CUBES_DIR, "the shipped sample cubes");

		List<CubeFiles> cubes = CubeFiles.scan(cubesDir);
		if (cubes.isEmpty()) {
			throw new IllegalStateException("No cubes in " + cubesDir.getAbsolutePath());
		}

		List<Ask> asks = new ArrayList<>();
		for (CubeFiles cubeFiles : cubes) {

			String cube = cubeFiles.getId();
			File hintsFile = cubeFiles.getHintsFile();
			File config = cubeFiles.getDslFile();
			File checksFile = new File(checksDir, cube + ".checks.json");
			if (!hintsFile.exists()) {
				throw new IllegalStateException(cube + " ships without its hints: " + hintsFile.getAbsolutePath());
			}
			if (!checksFile.exists()) {
				throw new IllegalStateException(cube + " ships hints with no truths behind them: "
						+ checksFile.getAbsolutePath());
			}

			Map<String, Map<String, Object>> queries = queriesOf(hintsFile, cubeFiles.getCubeName());
			CubeOptions file = CubeOptionsParser.parseGroovyCubeDslCode(Files.readString(config.toPath()));

			Set<String> checked = new LinkedHashSet<>();
			for (Map<String, Object> check : JSON.<List<Map<String, Object>>>readValue(checksFile,
					new TypeReference<List<Map<String, Object>>>() {
					})) {
				String hint = Objects.toString(check.get("hint"), "");
				Map<String, Object> query = queries.get(hint);
				if (query == null) {
					throw new IllegalStateException(checksFile.getName() + " holds rows for '" + hint
							+ "', which is not a hint of " + cube + ". Its hints are: " + queries.keySet());
				}
				if (!checked.add(hint)) {
					throw new IllegalStateException(checksFile.getName() + " holds two sets of rows for '" + hint
							+ "'. One hint, one truth.");
				}
				@SuppressWarnings("unchecked")
				List<List<Object>> rows = (List<List<Object>>) check.get("rows");
				Object refused = check.get("refusedOn");
				asks.add(new Ask(cube, hint, file, config, cubeFiles.getCubeName(), query, rows,
						refused instanceof List ? (List<?>) refused : null));
			}

			for (String hint : queries.keySet()) {
				if (!checked.contains(hint)) {
					throw new IllegalStateException(cube + "'s hint '" + hint + "' has no check in "
							+ checksFile.getName() + ". Every hint carries its truths.");
				}
			}
		}
		return asks;
	}

	/** A cube's hints, flattened: {@code <id>} for a hint and {@code <id>/<variant>} for a variant. */
	/**
	 * The hints of one cube. The cubes one DSL file holds under a name share one hints file, and
	 * each hint's query names its cube in cubeName, as a generate-sql request does; a file's
	 * unnamed cube owns the hints that name none.
	 */
	private Map<String, Map<String, Object>> queriesOf(File hintsFile, String cubeName) throws Exception {

		Map<String, Map<String, Object>> queries = new LinkedHashMap<>();
		for (Map<String, Object> hint : JSON.<List<Map<String, Object>>>readValue(hintsFile,
				new TypeReference<List<Map<String, Object>>>() {
				})) {
			String id = Objects.toString(hint.get("id"), "");
			@SuppressWarnings("unchecked")
			Map<String, Object> query = (Map<String, Object>) hint.get("query");
			if (!Objects.toString(cubeName, "").equals(Objects.toString(query.get("cubeName"), ""))) continue;
			queries.put(id, query);

			Object variants = hint.get("variants");
			if (variants instanceof List) {
				for (Object each : (List<?>) variants) {
					@SuppressWarnings("unchecked")
					Map<String, Object> variant = (Map<String, Object>) each;
					@SuppressWarnings("unchecked")
					Map<String, Object> variantQuery = (Map<String, Object>) variant.get("query");
					queries.put(id + "/" + variant.get("id"), variantQuery);
				}
			}
		}
		return queries;
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
	private String runCheck(Connection connection, String vendor, Ask ask) {

		boolean mustRefuse = ask.refusedOn(vendor);

		String sql;
		try {
			// The same two calls the generate-sql endpoint makes with dbVendor.
			CubeOptions cube = CubeSqlGenerator.pickCube(ask.file, ask.cubeKey());
			sql = CubeSqlGenerator.buildQuery(cube, ask.query, vendor).toInlineSql(vendor);
		} catch (IllegalArgumentException refusal) {
			// IllegalArgumentException is what the endpoint answers as a 400.
			if (mustRefuse) return null;
			return report(vendor, ask, "-", "generate-sql refused it: " + refusal.getMessage());
		}

		if (mustRefuse) {
			return report(vendor, ask, sql,
					"generate-sql was expected to refuse this on " + vendor + ", and generated SQL instead");
		}

		List<List<Object>> actual;
		try {
			actual = rows(connection, sql);
		} catch (Exception broken) {
			return report(vendor, ask, sql, "the database refused it: " + broken);
		}

		String difference = difference(ask.rows, actual, Boolean.TRUE.equals(ask.query.get("ordered")));
		return difference == null ? null : report(vendor, ask, sql, difference);
	}

	private String report(String vendor, Ask ask, String sql, String problem) {
		return "\n=== " + vendor + " | " + ask.cube + " | " + ask.hint + " " + ask.query + " ===\n  " + problem
				+ "\n  SQL: " + sql;
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

	// ── the two modes a cube widget is published in ──────────────────────────────

	/** The dashboard the parity cases publish to. Nothing of it outlives the check. */
	private static final String PARITY_REPORT = "parity-board";

	/**
	 * The connection the canvas was on. It is what the published file says, and therefore the only
	 * one the runtime may read an answer on - which is asserted below rather than assumed.
	 */
	private static final String PARITY_CONNECTION = "the-dashboards-connection";

	/** Filtered passes run, for the per-vendor line: a selection with a chip goes both ways too. */
	private int filteredPasses;

	/** What one pass of the two modes left behind: what went wrong, and the frozen mode's rows. */
	private record Both(List<String> problems, List<List<Object>> mode1) {
	}

	/**
	 * One hint's selection, published both ways on the same canvas and answered on the same
	 * database (design "Tests", <b>"The two modes give the same rows"</b>).
	 *
	 * <p><b>Mode 1, Show In Dashboard unchecked:</b> the selection is turned into SQL the way
	 * {@code generate-sql} turns it, the canvas freezes that SQL on the widget, and the real
	 * exporter publishes it - so what is run here is the SQL the published dashboard's own data
	 * script holds, read back out of the assembled script line by line.
	 *
	 * <p><b>Mode 2, checked:</b> the same selection is the {@code initial} of the
	 * {@code {reportId}-cube-widgets.json} entry the same exporter writes, read back with
	 * {@link CubeWidgets} - the runtime's own reader - and asked through
	 * {@link CubeRuntimeService#query}, values bound, connection and cube taken from the file.
	 *
	 * <p>Both must answer the hint's own truths, and each other. A hint with a filter of its own
	 * would prove the chips too; none of the shipped hints has one, so each hint that answered more
	 * than one value of its first dimension is asked a second time with a chip on it, and the two
	 * modes must agree about that answer as well.
	 *
	 * @return one entry per problem, empty when both modes answered the same rows
	 */
	private List<String> runParity(Connection connection, String vendor, Ask ask, int ordinal,
			List<String> notAsked) {

		if (ask.refusedOn(vendor)) {
			notAsked.add(vendor + " | parity " + ask.cube + " | " + ask.hint
					+ ": generate-sql refuses this question on " + vendor + ", so neither mode publishes it");
			return List.of();
		}

		String propertyBefore = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		String appPathBefore = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		List<String> problems = new ArrayList<>();
		try {
			// An installation of its own per case: the cube where a person's own cubes live, and the
			// dashboard's file written next to where its settings.xml would be. Under the temp folder,
			// never in the tree.
			Path home = tempDir.resolve("parity/" + vendor + "/" + ordinal);
			Path cubeDir = home.resolve("config/cubes/" + ask.cube);
			Files.createDirectories(cubeDir);
			Files.writeString(cubeDir.resolve("cube.xml"), "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<cube>\n"
					+ "    <name>" + ask.cube + "</name>\n    <description>A cube of a dashboard</description>\n"
					+ "    <connectionId>" + PARITY_CONNECTION + "</connectionId>\n</cube>\n");
			Files.writeString(cubeDir.resolve(ask.cube + "-cube-config.groovy"),
					Files.readString(ask.dslFile.toPath()));
			System.setProperty("PORTABLE_EXECUTABLE_DIR", home.toString());
			AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = home.toString();

			Map<String, Object> selection = selectionOf(ask.query);
			Both plain = bothModes(connection, vendor, ask, selection, ask.rows, home, "");
			problems.addAll(plain.problems());

			Map<String, Object> withAChip = withAChip(selection, plain.mode1());
			if (withAChip != null) {
				filteredPasses++;
				problems.addAll(bothModes(connection, vendor, ask, withAChip, null, home,
						" + " + withAChip.get("filters")).problems());
			}
		} catch (Exception broken) {
			problems.add(reportParity(vendor, ask, "", "-", "the two modes were not published: " + broken));
		} finally {
			AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = appPathBefore;
			if (propertyBefore == null) System.clearProperty("PORTABLE_EXECUTABLE_DIR");
			else System.setProperty("PORTABLE_EXECUTABLE_DIR", propertyBefore);
		}
		return problems;
	}

	/** One selection, both ways. {@code expected} is the hint's own rows, or null for a chip pass. */
	private Both bothModes(Connection connection, String vendor, Ask ask, Map<String, Object> selection,
			List<List<Object>> expected, Path home, String what) {

		List<String> problems = new ArrayList<>();
		boolean ordered = Boolean.TRUE.equals(ask.query.get("ordered"));

		// ── Mode 1: the frozen SQL the published data script holds ────────────────
		String frozenSql;
		String script;
		DashboardFileGenerator.GeneratedFiles files;
		try {
			CubeOptions cube = CubeSqlGenerator.pickCube(ask.file, ask.cubeKey());
			frozenSql = CubeSqlGenerator.buildQuery(cube, selection, vendor).toInlineSql(vendor);
			List<Map<String, Object>> canvas = List.of(cubeWidget("w-frozen", ask, selection, false, frozenSql),
					cubeWidget("w-live", ask, selection, true, ""));
			script = ScriptAssembler.assemble(canvas, List.of()).text();
			files = DashboardFileGenerator.generate(canvas, List.of(), PARITY_REPORT,
					"http://localhost:9090/api", PARITY_CONNECTION);
		} catch (Exception broken) {
			problems.add(reportParity(vendor, ask, what, "-", "the canvas was not published: " + broken));
			return new Both(problems, List.of());
		}

		String published = frozenSqlOf(script);
		if (published.isBlank()) {
			problems.add(reportParity(vendor, ask, what, script,
					"the published data script holds no SQL for the unchecked widget"));
			return new Both(problems, List.of());
		}
		if (published.contains("${dp_")) {
			problems.add(reportParity(vendor, ask, what, published,
					"the frozen SQL still carries a builtin variable, which only a request can bind"));
			return new Both(problems, List.of());
		}

		List<List<Object>> mode1;
		try {
			mode1 = rows(connection, published);
		} catch (Exception broken) {
			problems.add(reportParity(vendor, ask, what, published, "the database refused Mode 1: " + broken));
			return new Both(problems, List.of());
		}

		// ── Mode 2: the same selection, live, through the runtime ─────────────────
		List<List<Object>> mode2;
		try {
			mode2 = liveRows(connection, vendor, files.cubeWidgetsJson(), home, problems, ask, what);
		} catch (Exception broken) {
			problems.add(reportParity(vendor, ask, what, published, "the live cube refused it: " + broken));
			return new Both(problems, mode1);
		}
		if (mode2 == null) return new Both(problems, mode1);

		// ── And what they must agree with ─────────────────────────────────────────
		if (expected != null) {
			String mode1Differs = difference(expected, mode1, ordered);
			if (mode1Differs != null)
				problems.add(reportParity(vendor, ask, what, published, "Mode 1: " + mode1Differs));
			String mode2Differs = difference(expected, mode2, ordered);
			if (mode2Differs != null)
				problems.add(reportParity(vendor, ask, what, published, "Mode 2: " + mode2Differs));
		} else if (mode1.isEmpty()) {
			problems.add(reportParity(vendor, ask, what, published,
					"the chip left no rows at all, so the pass proves nothing"));
		}
		String between = difference(mode1, mode2, ordered);
		if (between != null)
			problems.add(reportParity(vendor, ask, what, published, "the two modes disagree - " + between));

		return new Both(problems, mode1);
	}

	/**
	 * Mode 2's rows: the exporter's own {@code -cube-widgets.json} written where the runtime looks
	 * for it, read back by the runtime's reader, and the entry's {@code initial} asked as a viewer's
	 * opening request - which is what the renderer sends when the dashboard opens.
	 */
	private List<List<Object>> liveRows(Connection connection, String vendor, String widgetsJson, Path home,
			List<String> problems, Ask ask, String what) throws Exception {

		if (widgetsJson.isBlank()) {
			problems.add(reportParity(vendor, ask, what, "-",
					"the exporter declared no live cube for a widget that is ticked"));
			return null;
		}
		Path reportDir = home.resolve("config/reports/" + PARITY_REPORT);
		Files.createDirectories(reportDir);
		Files.writeString(reportDir.resolve(PARITY_REPORT + CubeWidgets.SUFFIX), widgetsJson);

		Map<String, Map<String, Object>> declared = JSON.readValue(widgetsJson,
				new TypeReference<LinkedHashMap<String, Map<String, Object>>>() {
				});
		String componentId = declared.keySet().iterator().next();
		CubeWidgets.Widget widget = CubeWidgets.of(PARITY_REPORT, componentId);

		TheLoopsDatabase database = new TheLoopsDatabase(jdbiOn(connection), vendor);
		CubesService cubesService = new CubesService();
		LimitsSandbox sandbox = new LimitsSandbox(new LimitsService(null, null));
		ReflectionTestUtils.setField(cubesService, "limitsSandbox", sandbox);
		CubeRuntimeService runtime = new CubeRuntimeService();
		ReflectionTestUtils.setField(runtime, "cubesService", cubesService);
		ReflectionTestUtils.setField(runtime, "cubeFilterOptions", new CubeFilterOptions());
		ReflectionTestUtils.setField(runtime, "limitsSandbox", sandbox);
		// The seam CubeRuntimeService declares for a test (useDatabase); set by its field, because
		// that method is the cubes package's own and this loop is not in it.
		ReflectionTestUtils.setField(runtime, "database", database);

		// What the renderer opens with: the entry's own selection, and nothing the request added.
		Map<String, Object> request = new LinkedHashMap<>(widget.initial());
		Map<String, Object> answer = runtime.query(PARITY_REPORT, componentId, request, Map.of());

		if (!PARITY_CONNECTION.equals(database.readOn)) {
			problems.add(reportParity(vendor, ask, what, "-", "the live cube read its answer on '"
					+ database.readOn + "', and the dashboard declares '" + PARITY_CONNECTION + "'"));
			return null;
		}
		List<List<Object>> rows = new ArrayList<>();
		for (Object row : (List<?>) answer.get("rows")) {
			rows.add(new ArrayList<>(((Map<?, ?>) row).values()));
		}
		return rows;
	}

	/** The selection, as the canvas holds it: the keys a cube widget carries, and no check's flag. */
	private static Map<String, Object> selectionOf(Map<String, Object> query) {
		Map<String, Object> selection = new LinkedHashMap<>();
		for (String key : List.of("dimensions", "measures", "segments", "granularities", "filters", "order",
				"limit")) {
			if (query.get(key) != null) selection.put(key, query.get(key));
		}
		return selection;
	}

	/**
	 * The same selection with one chip on it: the first dimension, held to the first row's value.
	 * Null when this hint cannot carry one - no dimension, no rows, a value that is not a word, or
	 * one value only, where a chip would prove nothing.
	 */
	private static Map<String, Object> withAChip(Map<String, Object> selection, List<List<Object>> rows) {

		List<?> dimensions = selection.get("dimensions") instanceof List<?> list ? list : List.of();
		if (dimensions.isEmpty() || rows.isEmpty()) return null;
		// The first column is the first dimension. A grain of a date - "BookedDate.month" - is a
		// column of the answer and not a member a filter may name, so a hint that opens with one
		// carries no chip here.
		String member = Objects.toString(dimensions.get(0), "");
		if (member.isBlank() || member.indexOf('.') >= 0) return null;
		Set<Object> values = new LinkedHashSet<>();
		for (List<Object> row : rows) {
			if (!row.isEmpty()) values.add(row.get(0));
		}
		if (values.size() < 2) return null;
		Object first = values.iterator().next();
		if (!(first instanceof String word) || word.isBlank()) return null;

		Map<String, Object> withAChip = new LinkedHashMap<>(selection);
		withAChip.put("filters",
				List.of(Map.of("member", member, "operator", "in", "values", List.of(word))));
		return withAChip;
	}

	/** One cube widget of the canvas, in the shape the AI Hub sends it in. */
	private static Map<String, Object> cubeWidget(String id, Ask ask, Map<String, Object> selection,
			boolean showInDashboard, String generatedSql) {

		Map<String, Object> visualQuery = new LinkedHashMap<>();
		visualQuery.put("kind", "cube");
		visualQuery.put("cubeId", ask.cube);
		visualQuery.put("cubeName", ask.cubeKey());
		visualQuery.put("cubeSelection", selection);
		if (showInDashboard) visualQuery.put("showInDashboard", true);

		Map<String, Object> dataSource = new LinkedHashMap<>();
		dataSource.put("mode", "visual");
		dataSource.put("visualQuery", visualQuery);
		dataSource.put("generatedSql", generatedSql);

		Map<String, Object> widget = new LinkedHashMap<>();
		widget.put("id", id);
		widget.put("type", "tabulator");
		widget.put("dataSource", dataSource);
		widget.put("gridPosition", Map.of("x", 0, "y", showInDashboard ? 4 : 0, "w", 6, "h", 4));
		widget.put("displayConfig", Map.of());
		return widget;
	}

	/** A line of SQL as the published script appends it: {@code sql << '…\n'}. */
	private static final Pattern PUBLISHED_SQL_LINE = Pattern.compile("^\\s*(\\w+) << '(.*)\\\\n'$");

	/**
	 * The SQL the published data script builds, read back out of it line by line - so what Mode 1
	 * runs is what the dashboard runs, and not the string the test handed the exporter.
	 */
	private static String frozenSqlOf(String script) {
		StringBuilder sql = new StringBuilder();
		for (String line : script.split("\n", -1)) {
			Matcher appended = PUBLISHED_SQL_LINE.matcher(line);
			if (!appended.matches() || !appended.group(1).endsWith("sql")) continue;
			sql.append(unescaped(appended.group(2))).append('\n');
		}
		return sql.toString();
	}

	/** Groovy's single-quoted escaping, undone. */
	private static String unescaped(String text) {
		StringBuilder plain = new StringBuilder();
		for (int at = 0; at < text.length(); at++) {
			char letter = text.charAt(at);
			if (letter == '\\' && at + 1 < text.length()) letter = text.charAt(++at);
			plain.append(letter);
		}
		return plain.toString();
	}

	private String reportParity(String vendor, Ask ask, String what, String sql, String problem) {
		return "\n=== " + vendor + " | two modes | " + ask.cube + " | " + ask.hint + what + " ===\n  " + problem
				+ "\n  SQL: " + sql;
	}

	/** The vendor loop's own database, as the runtime needs one: its connection, its values bound. */
	private static final class TheLoopsDatabase implements CubeRuntimeService.Database {

		private final Jdbi jdbi;
		private final String vendor;
		private String readOn;
		private String sql;

		private TheLoopsDatabase(Jdbi jdbi, String vendor) {
			this.jdbi = jdbi;
			this.vendor = vendor;
		}

		@Override
		public String vendorOf(String connectionId) {
			return vendor;
		}

		@Override
		public List<Map<String, Object>> read(String connectionId, String sql, Map<String, Object> params,
				int limit) {
			this.readOn = connectionId;
			this.sql = sql;
			return jdbi.withHandle(handle -> {
				org.jdbi.v3.core.statement.Query query = handle.createQuery(sql);
				for (Map.Entry<String, Object> bind : (params == null ? Map.<String, Object>of() : params)
						.entrySet()) {
					if (bind.getValue() instanceof List<?> list) query.bindList(bind.getKey(), list);
					else query.bind(bind.getKey(), bind.getValue());
				}
				if (limit > 0) query.setMaxRows(limit);
				return query.map((resultSet, context) -> {
					Map<String, Object> row = new LinkedHashMap<>();
					for (int column = 1; column <= resultSet.getMetaData().getColumnCount(); column++) {
						row.put(resultSet.getMetaData().getColumnLabel(column), resultSet.getObject(column));
					}
					return row;
				}).list();
			});
		}
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

	// ── the AI Hub cases ─────────────────────────────────────────────────────────

	/**
	 * One AI Hub question: its committed SQL runs, and answers this.
	 *
	 * <p>The case lives in {@code ai-hub-sql-cases.json} - the query or probe, and the rows - and
	 * its SQL in {@code ai-hub-sql.generated.json}, written by the generator itself
	 * ({@code write-ai-hub-sql.ts}) for each of the nine vendor keys. Nothing here builds SQL: the
	 * generator is TypeScript, exactly as in production, where AI Hub builds the SQL and the backend
	 * runs it.
	 */
	private static final class AiHubCase {

		private final String id;
		private final String group;
		private final List<List<Object>> rows;
		private final Integer rowCount;
		private final boolean ordered;
		/**
		 * The labels the result must come back with, compared exactly: one list when every vendor
		 * answers the same, or a map vendor -> labels when they do not - an unquoted alias comes
		 * back folded to upper case on Oracle and Db2, which is recorded here per vendor, not fixed.
		 */
		private final Object columns;
		private final List<?> vendors;
		/**
		 * Per vendor, a session setting that used to change this case's answer, e.g.
		 * {@code SET DATEFIRST 1} on SQL Server. The case is asked twice on such a vendor - in the
		 * loop's own session and under this one - and must answer the same both times.
		 */
		private final Map<String, String> session;
		/**
		 * A dashboard parameter's value, as text - which is how every path delivers one - keyed by
		 * its name; null for a case with no parameters. The SQL then holds {@code ${name}}, and the
		 * case is asked the way the canvas asks it: through {@code QueriesService.prepare}, which
		 * turns the placeholders into JDBI's {@code :name} and binds each value as the type
		 * {@link #paramTypes} declares.
		 */
		private final Map<String, Object> params;
		/** The type each parameter was declared with on the canvas: {@code {to: "Date"}}. */
		private final Map<String, String> paramTypes;
		/**
		 * Group D only: the vendors that refuse this SQL, each with the database's own words. The
		 * user's SQL is the user's - a database that does not know a construct is a fact about that
		 * database, recorded here and reported, never a reason to rewrite what the user typed.
		 */
		private final Map<String, String> excluded;

		private AiHubCase(String id, String group, List<List<Object>> rows, Integer rowCount, boolean ordered,
				Object columns, List<?> vendors, Map<String, String> session, Map<String, Object> params,
				Map<String, String> paramTypes, Map<String, String> excluded) {
			this.id = id;
			this.group = group;
			this.rows = rows;
			this.rowCount = rowCount;
			this.ordered = ordered;
			this.columns = columns;
			this.vendors = vendors;
			this.session = session;
			this.params = params;
			this.paramTypes = paramTypes;
			this.excluded = excluded;
		}
	}

	/**
	 * The cases, with the SQL the generator wrote for them.
	 *
	 * <p>A case with no SQL, or a vendor missing from a case's SQL, fails here rather than on the
	 * vendor the loop happens to start, and says how to write the file again - the generated file is
	 * committed, so it can be older than the generator. Jasmine block 10 is the other half of that
	 * tie: it fails when the file no longer matches what the generator writes today.
	 */
	private List<AiHubCase> readAiHubCases() throws Exception {

		Path casesFile = Paths.get(AI_HUB_CASES);
		Path sqlFile = Paths.get(AI_HUB_SQL);
		if (!Files.exists(casesFile) || !Files.exists(sqlFile)) {
			throw new IllegalStateException("The AI Hub cases are missing: " + casesFile.toAbsolutePath() + " and "
					+ sqlFile.toAbsolutePath() + ". " + WRITE_AI_HUB_SQL);
		}

		Map<String, Object> file = JSON.readValue(casesFile.toFile(), new TypeReference<Map<String, Object>>() {
		});
		@SuppressWarnings("unchecked")
		List<Map<String, Object>> cases = (List<Map<String, Object>>) file.get("cases");
		if (cases == null || cases.isEmpty()) {
			throw new IllegalStateException(casesFile.getFileName() + " holds no cases.");
		}

		aiHubSql = JSON.readValue(sqlFile.toFile(), new TypeReference<Map<String, Map<String, String>>>() {
		});

		List<AiHubCase> read = new ArrayList<>();
		Set<String> seen = new LinkedHashSet<>();
		for (Map<String, Object> one : cases) {

			String id = Objects.toString(one.get("id"), "");
			if (!seen.add(id)) {
				throw new IllegalStateException(casesFile.getFileName() + " holds two cases called '" + id
						+ "'. One case, one id.");
			}
			Map<String, String> perVendorSql = aiHubSql.get(id);
			if (perVendorSql == null) {
				throw new IllegalStateException("No generated SQL for case '" + id + "'. " + WRITE_AI_HUB_SQL);
			}
			for (String vendor : EVERY_VENDOR) {
				if (!perVendorSql.containsKey(vendor)) {
					throw new IllegalStateException("The generated SQL of case '" + id + "' has no " + vendor
							+ " form. " + WRITE_AI_HUB_SQL);
				}
			}
			@SuppressWarnings("unchecked")
			List<List<Object>> rows = (List<List<Object>>) one.get("rows");
			Object rowCount = one.get("rowCount");
			if ((rows == null) == (rowCount == null)) {
				throw new IllegalStateException("Case '" + id + "' must hold either rows or a rowCount.");
			}
			@SuppressWarnings("unchecked")
			Map<String, String> session = (Map<String, String>) one.get("session");
			@SuppressWarnings("unchecked")
			Map<String, Object> params = (Map<String, Object>) one.get("params");
			@SuppressWarnings("unchecked")
			Map<String, String> paramTypes = (Map<String, String>) one.get("paramTypes");
			@SuppressWarnings("unchecked")
			Map<String, String> excluded = (Map<String, String>) one.get("excluded");
			read.add(new AiHubCase(id, Objects.toString(one.get("group"), ""), rows,
					rowCount instanceof Number ? ((Number) rowCount).intValue() : null,
					Boolean.TRUE.equals(one.get("ordered")), one.get("columns"),
					(List<?>) one.get("vendors"), session, params, paramTypes, excluded));
		}
		return read;
	}

	/**
	 * Why an AI Hub case is not asked on a vendor, or null when it is.
	 *
	 * <p>Groups A and D name their tables {@code cube_demo.<table>}, and the loop seeds
	 * {@code cube_demo} on every vendor, so every vendor answers them - group D being the user's own
	 * SQL, sent byte for byte, with the vendors that refuse a construct listed in the case's
	 * {@code excluded}; group A being what the generator wrote - that loop is itself the proof that AI Hub reaches a
	 * schema outside the default one. A group A case carries an {@code excluded} vendor only where
	 * the driver will not make the binding at all, however the SQL is written: ClickHouse reads no
	 * timestamp against a date column (p1b). Groups B and C read Northwind and the star schema by their
	 * bare names, which only the two legs that run on a copy of a shipped sample file have; and a
	 * case may name the vendors it belongs to ({@code fact_sales} is built only by the DuckDB and
	 * ClickHouse warehouse creators, and ClickHouse has no {@code main} schema here).
	 */
	private static String whyNotAiHub(AiHubCase one, String vendor) {
		if (one.vendors != null && !one.vendors.contains(vendor)) {
			return "the case runs on " + one.vendors + " only";
		}
		if (one.excluded != null && one.excluded.containsKey(vendor)) {
			return "this database refuses the construct, recorded rather than fixed: " + one.excluded.get(vendor);
		}
		if (!"A".equals(one.group) && !"D".equals(one.group) && !IN_PROCESS.contains(vendor)) {
			return "group " + one.group + " reads Northwind and the star schema by their bare names, which only the "
					+ "legs running on a copy of a shipped sample file have (" + IN_PROCESS + ")";
		}
		return null;
	}

	/**
	 * Returns null when the case passes, otherwise the one line that says what went wrong.
	 *
	 * <p>A case may name a session setting per vendor ({@code session}), one that used to change its
	 * answer: {@code SET DATEFIRST 1} on SQL Server, {@code ALTER SESSION SET NLS_TERRITORY =
	 * 'GERMANY'} on Oracle. It is then asked twice on that vendor - in the loop's own session, then
	 * under the hostile one - and must answer the same both times. The setting is read before it is
	 * changed and put back afterwards, whatever happens, because the loop holds ONE connection per
	 * vendor and every later case runs on it. This is test code: nothing here builds SQL, and the
	 * generator knows nothing about sessions - that is the point, its forms cannot be moved by one.
	 */
	private String runAiHubCase(Jdbi jdbi, String vendor, AiHubCase one) {

		String problem = askAiHubCase(jdbi, vendor, one);
		if (problem != null) return problem;

		String hostile = one.session == null ? null : one.session.get(vendor);
		if (hostile == null) return null;

		String restore;
		try {
			restore = sessionSettingOf(jdbi, vendor);
		} catch (Exception broken) {
			return reportAiHub(vendor, one, aiHubSql.get(one.id).get(vendor),
					"the session setting could not be read back, so `" + hostile + "` was not applied: " + broken);
		}
		try {
			jdbi.useHandle(handle -> handle.execute(hostile));
			String underHostile = askAiHubCase(jdbi, vendor, one);
			return underHostile == null ? null : "\n  (asked again under `" + hostile + "`)" + underHostile;
		} catch (Exception broken) {
			return reportAiHub(vendor, one, aiHubSql.get(one.id).get(vendor),
					"`" + hostile + "` was refused: " + broken);
		} finally {
			jdbi.useHandle(handle -> handle.execute(restore));
		}
	}

	/**
	 * The statement that puts this vendor's session setting back where it was.
	 *
	 * <p>Read from the database rather than assumed: the default is the image's, not ours - SQL
	 * Server's DATEFIRST comes from the login's language, Oracle's territory from the instance.
	 */
	private static String sessionSettingOf(Jdbi jdbi, String vendor) {
		switch (vendor) {
			case "sqlserver":
				return "SET DATEFIRST " + jdbi.withHandle(
						handle -> handle.createQuery("SELECT @@DATEFIRST").mapTo(Integer.class).one());
			case "oracle":
				return "ALTER SESSION SET NLS_TERRITORY = '" + jdbi.withHandle(
						handle -> handle.createQuery(
								"SELECT value FROM nls_session_parameters WHERE parameter = 'NLS_TERRITORY'")
								.mapTo(String.class).one()) + "'";
			default:
				throw new IllegalStateException("A case names a session setting for '" + vendor
						+ "', but there is no way written here to read that vendor's setting and put it back.");
		}
	}

	/** The case asked once, in whatever session the connection is in. */
	private String askAiHubCase(Jdbi jdbi, String vendor, AiHubCase one) {

		String generated = aiHubSql.get(one.id).get(vendor);

		// A case with parameters is asked the way the canvas asks it: the generated SQL holds
		// `${to}`, and QueriesService - the production path, not a copy of it - rewrites that to
		// JDBI's `:to` and binds the text as the type the dashboard declared. That conversion is
		// the whole point of such a case: bound as text, `close_date <= :to` is an error on
		// PostgreSQL and silently the wrong rows on SQLite.
		// Group D is the user's own SQL. It goes through the canvas's own prepare too - P2 put a
		// line parser in there - although it binds nothing, so the text that reaches the database
		// is proven to be the text the user typed.
		QueriesService.PreparedSql prepared = one.params == null && !"D".equals(one.group) ? null
				: QueriesService.prepare(generated, one.params == null ? Map.of() : one.params,
						one.paramTypes == null ? Map.of() : one.paramTypes);
		String sql = prepared == null ? generated : prepared.sql();
		Map<String, Object> binds = prepared == null || prepared.params() == null ? Map.of()
				: prepared.params();
		if ("D".equals(one.group) && !generated.equals(sql)) {
			return reportAiHub(vendor, one, sql,
					"QueriesService.prepare changed the user's own SQL on its way to the database");
		}

		List<Map<String, Object>> answered;
		try {
			answered = jdbi.withHandle(handle -> {
				// The mapping SqlExecutor.executeQuery uses: the label as the vendor's catalog
				// reports it, never JDBI's lower-cased mapToMap, because AI Hub reads a probe's
				// columns back by name.
				org.jdbi.v3.core.statement.Query query = handle.createQuery(sql);
				for (Map.Entry<String, Object> bind : binds.entrySet()) {
					if (bind.getValue() instanceof List<?> list) {
						query.bindList(bind.getKey(), list);
					} else {
						query.bind(bind.getKey(), bind.getValue());
					}
				}
				return query.map((resultSet, context) -> {
					java.sql.ResultSetMetaData meta = resultSet.getMetaData();
					Map<String, Object> row = new LinkedHashMap<>();
					for (int column = 1; column <= meta.getColumnCount(); column++) {
						row.put(meta.getColumnLabel(column), resultSet.getObject(column));
					}
					return row;
				}).list();
			});
		} catch (Exception broken) {
			return reportAiHub(vendor, one, sql, "the database refused it: " + broken
					+ (binds.isEmpty() ? "" : " (parameters " + binds + ")"));
		}

		Object wantedColumns = one.columns instanceof Map<?, ?> perVendor ? perVendor.get(vendor) : one.columns;
		if (wantedColumns != null) {
			List<String> labels = answered.isEmpty() ? List.of() : new ArrayList<>(answered.get(0).keySet());
			if (!wantedColumns.equals(labels)) {
				// Oracle and Db2 fold an unquoted alias to upper case, and AI Hub would not find it.
				return reportAiHub(vendor, one, sql,
						"the columns came back as " + labels + " instead of " + wantedColumns);
			}
		}

		List<List<Object>> actual = new ArrayList<>();
		for (Map<String, Object> row : answered) {
			actual.add(new ArrayList<>(row.values()));
		}

		if (one.rowCount != null) {
			return one.rowCount == actual.size() ? null
					: reportAiHub(vendor, one, sql, "expected " + one.rowCount + " rows, got " + actual.size());
		}

		String difference = difference(one.rows, actual, one.ordered);
		return difference == null ? null : reportAiHub(vendor, one, sql, difference);
	}

	private String reportAiHub(String vendor, AiHubCase one, String sql, String problem) {
		return "\n=== " + vendor + " | AI Hub | " + one.id + " (group " + one.group + ") ===\n  " + problem
				+ "\n  SQL: " + sql;
	}

	/**
	 * JDBI on the loop's own connection.
	 *
	 * <p>{@code SqlExecutor} goes through {@code handle.createQuery}, so the cases do too: JDBI
	 * reads {@code :name} in the SQL as a parameter, and a colon that would break production breaks
	 * the test here. {@code SqlExecutor} itself wants a saved connection file, which a throwaway
	 * database has not got, so this is the one thing the test holds instead of calling it.
	 *
	 * <p>The connection is handed over as a proxy that ignores {@code close()}: a handle closes its
	 * connection, and this one is the vendor's single connection, seeded and - on SQLite - carrying
	 * the attached {@code cube_demo}.
	 */
	private static Jdbi jdbiOn(Connection connection) {
		Connection notClosing = (Connection) java.lang.reflect.Proxy.newProxyInstance(
				GeneratedSqlAllVendorsTest.class.getClassLoader(), new Class<?>[] { Connection.class },
				(proxy, method, arguments) -> {
					if ("close".equals(method.getName())) return null;
					try {
						return method.invoke(connection, arguments);
					} catch (java.lang.reflect.InvocationTargetException wrapped) {
						throw wrapped.getCause();
					}
				});
		return com.sourcekraft.documentburster.common.reportparameters.ParameterArguments
				.install(Jdbi.create(() -> notClosing));
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

		String[] jdbc = jdbcFor(vendor);

		// The container is healthy by now, but a database that has just answered its healthcheck
		// can still refuse the first JDBC connection while it finishes opening.
		Exception last = null;
		for (int attempt = 1; attempt <= 30; attempt++) {
			try {
				return DriverManager.getConnection(jdbc[0], jdbc[1], jdbc[2]);
			} catch (Exception notYet) {
				last = notYet;
				Thread.sleep(5000);
			}
		}
		throw new IllegalStateException(vendor + " never took a connection on " + jdbc[0], last);
	}

	/** Where a container vendor's database is, as {url, user, password}. */
	private String[] jdbcFor(String vendor) throws Exception {

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

		return new String[] { url, user, password };
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
		// The day is pinned: the script shifts the rows to the caller's today, and the checks hold
		// the answers for the day the rows were generated for. And it wipes, so a container that
		// was seeded before this run is loaded again rather than trusted.
		SeedScriptRunner.run(connection, vendor.toUpperCase(Locale.ROOT), script,
				NorthwindFixture.cubeDemoSeedParams(script.getParent().resolve("cube-demo-data")));

		assertASecondRunDoesNothing(connection, vendor, script);

		loadNorthwind(vendor);

		mirrorCubeDemoLowercase(connection, vendor);
	}

	/**
	 * Oracle and Db2 also get {@code cube_demo} under the name the AI Hub cases write.
	 *
	 * <p>The shipped seed script creates the schema and its tables undelimited - {@code CREATE TABLE
	 * cube_demo.crm_deals} - which is what the cubes need, so it is not touched. Oracle and Db2 fold
	 * an undelimited name to upper case, so those two hold {@code CUBE_DEMO.CRM_DEALS}, while every
	 * other vendor here holds {@code cube_demo.crm_deals}. The AI Hub cases name the table the way a
	 * lowercase-folding vendor's catalog reports it, and the generator quotes what it is given
	 * (that is right: in the product the name comes from the catalog of the database in front of it,
	 * so on a real Oracle it would be quoting {@code CRM_DEALS}).
	 *
	 * <p>Rather than write the cases twice, these two vendors get a second, delimited-lowercase
	 * {@code "cube_demo"} schema of views over the seeded tables, with lowercase column names. The
	 * group A cases then run on all nine vendors unchanged, which is the point of the loop: the
	 * Oracle and Db2 forms of every expression are exercised on a real Oracle and a real Db2.
	 */
	private void mirrorCubeDemoLowercase(Connection connection, String vendor) throws Exception {

		boolean oracle = "oracle".equals(vendor);
		if (!oracle && !"db2".equals(vendor)) return;

		if (oracle) {
			// The user may be left over from an earlier run of the loop against the same container.
			ignoringFailure(connection, "CREATE USER \"cube_demo\" NO AUTHENTICATION");
			// A view is created in that schema, so its owner needs the privilege and the reads.
			ignoringFailure(connection, "GRANT CREATE VIEW TO \"cube_demo\"");
		} else {
			ignoringFailure(connection, "CREATE SCHEMA \"cube_demo\"");
		}

		for (String table : catalogNames(connection, oracle
				? "SELECT table_name FROM all_tables WHERE owner = 'CUBE_DEMO' ORDER BY table_name"
				: "SELECT tabname FROM syscat.tables WHERE tabschema = 'CUBE_DEMO' AND type = 'T' ORDER BY tabname")) {

			List<String> columns = catalogNames(connection, oracle
					? "SELECT column_name FROM all_tab_columns WHERE owner = 'CUBE_DEMO' AND table_name = '" + table
							+ "' ORDER BY column_id"
					: "SELECT colname FROM syscat.columns WHERE tabschema = 'CUBE_DEMO' AND tabname = '" + table
							+ "' ORDER BY colno");
			if (columns.isEmpty()) continue;

			StringBuilder select = new StringBuilder();
			for (String column : columns) {
				if (select.length() > 0) select.append(", ");
				select.append('"').append(column).append("\" AS \"").append(column.toLowerCase(Locale.ROOT))
						.append('"');
			}

			if (oracle) {
				ignoringFailure(connection, "GRANT SELECT ON CUBE_DEMO." + table + " TO \"cube_demo\"");
			}
			try (Statement statement = connection.createStatement()) {
				statement.execute("CREATE OR REPLACE VIEW \"cube_demo\".\"" + table.toLowerCase(Locale.ROOT)
						+ "\" AS SELECT " + select + " FROM CUBE_DEMO." + table);
			}
		}
	}

	/** The names one catalog query returns, in its order. */
	private List<String> catalogNames(Connection connection, String sql) throws Exception {
		List<String> names = new ArrayList<>();
		try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
			while (rows.next()) {
				names.add(rows.getString(1).trim());
			}
		}
		return names;
	}

	/**
	 * A fixture statement that is allowed to have been done already - the user, the schema, the
	 * grant - on a container an earlier run of the loop left behind. A real problem surfaces at the
	 * next statement, which is not forgiven.
	 */
	private void ignoringFailure(Connection connection, String sql) {
		try (Statement statement = connection.createStatement()) {
			statement.execute(sql);
		} catch (Exception alreadyThere) {
			// Deliberate: see above.
		}
	}

	/**
	 * Northwind, through the product's own path.
	 *
	 * <p>{@code NorthwindManager.initializeDatabaseWithGenerator} is what the packager and
	 * {@code system service database start} run: JPA and {@code NorthwindDataGenerator} on the
	 * server vendors, {@code ClickHouseDataWarehouseCreator} on ClickHouse. Nothing here is a
	 * second loader, so the Northwind of this throwaway database is the Northwind a customer gets,
	 * and one hint's rows hold on every database.
	 *
	 * <p>The manager normally talks to the containers it started itself, on a published port. These
	 * containers publish nothing and are reached by service name, so the loop hands it the address
	 * it already uses - {@code setJdbcOverride} - rather than starting a second set of databases.
	 *
	 * <p>SQLite and DuckDB are not here: both legs run on a copy of a shipped sample file, which
	 * already carries Northwind.
	 */
	private void loadNorthwind(String vendor) throws Exception {

		// SQLite and DuckDB run on a copy of a shipped sample file, which already carries Northwind.
		if (IN_PROCESS.contains(vendor)) return;

		DatabaseVendor which = DatabaseVendor.valueOf(vendor.toUpperCase(Locale.ROOT));
		String[] jdbc = jdbcFor(vendor);

		Path home = tempDir.resolve("northwind-" + vendor);
		Files.createDirectories(home);

		if (which == DatabaseVendor.CLICKHOUSE) {
			// The ClickHouse warehouse is copied out of the SQLite sample, which the creator looks
			// for in the sibling folder of the one it is given - the same layout the product has.
			NorthwindFixture.writableSqliteCopy(
					Files.createDirectories(tempDir.resolve("sample-northwind-sqlite")).resolve("northwind.db"));
		}

		try (NorthwindManager manager = new NorthwindManager()) {
			manager.setJdbcOverride(which, jdbc[0], jdbc[1], jdbc[2]);
			manager.initializeDatabaseWithGenerator(which, home);
		}
	}

	/**
	 * The script runs once: a second run finds the data complete and leaves the database alone.
	 * This is the same promise {@code CubeDemoRunOnceTest} holds on DuckDB and SQLite, asked here of
	 * every vendor the loop starts - and it costs one run that does nothing.
	 *
	 * <p>It asks for a different day, which needs no write to prove: had the script reloaded, the
	 * marker would say that other day and every dated check below would be answering about the
	 * wrong dates.
	 */
	private void assertASecondRunDoesNothing(Connection connection, String vendor, Path script) throws Exception {

		SeedScriptRunner.run(connection, vendor.toUpperCase(Locale.ROOT), script,
				Map.of("today", "2027-01-31", "wipe", "false", "dataDir",
						script.getParent().resolve("cube-demo-data").toAbsolutePath().toString()));

		String seededOn;
		try (Statement statement = connection.createStatement();
				ResultSet marker = statement.executeQuery("SELECT seeded_on FROM cube_demo.demo_info")) {
			if (!marker.next()) {
				throw new IllegalStateException(vendor + ": cube_demo.demo_info holds no row after seeding");
			}
			seededOn = String.valueOf(marker.getObject(1));
		}

		if (!seededOn.startsWith(NorthwindFixture.CUBE_DEMO_TODAY)) {
			throw new IllegalStateException(vendor + ": the second run reloaded the data - cube_demo.demo_info"
					+ " says it was seeded on " + seededOn + " instead of " + NorthwindFixture.CUBE_DEMO_TODAY);
		}
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
