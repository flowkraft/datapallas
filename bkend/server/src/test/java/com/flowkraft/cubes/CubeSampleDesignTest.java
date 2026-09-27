package com.flowkraft.cubes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;

/**
 * The design rules the shipped sample cubes are built on, kept as a test so they stay true after the
 * run that introduced them.
 *
 * <p>CubeSampleSqlExecutesTest proves the samples RUN. This proves they are still SHAPED the way a
 * Kimball model is shaped, which is the thing a later edit quietly breaks: a second cube added to a
 * file because it was easier than a new folder, a business question hard-wired as a WHERE in the
 * cube's own SQL instead of offered as a segment, a title left behind when a folder is renamed.
 *
 * <p>Five rules, each with the negative half beside it - a deliberately broken cube the same checker
 * must reject. A rule with no negative half is a rule that can rot into a no-op without anybody
 * noticing: if getSql() started returning null for every cube, "no cube's SQL has a WHERE" would go
 * on passing forever.
 */
class CubeSampleDesignTest {

	private static final String SAMPLES_CUBES_DIR = "../../asbl/src/main/external-resources/db-template/config/samples-cubes";

	/**
	 * The 13 cubes that ship, one per business process, one per file. Kept here rather than read off
	 * the directory: a folder that disappears has to turn this test red, not shrink its own sweep.
	 */
	private static final List<String> SHIPPED_CUBES = List.of("northwind-sales", "northwind-customers",
			"northwind-hr", "northwind-inventory", "northwind-warehouse", "online-sales", "sales-pipeline",
			"support-desk", "freight-shipments", "student-enrollments", "customer-invoices", "customer-payments",
			"invoice-balances");

	/**
	 * Invoice Balances is the one cube allowed to read a table another cube is built on: it answers
	 * "what is still owed", which is invoices less their payments, so its own SQL joins both. It is a
	 * deliberate overlap, written down here rather than left as an exception the next reader has to
	 * guess at. It is exempt from rule 2 only, and passes rules 1, 3, 4 and 5 like every other cube.
	 */
	private static final String OVERLAPS_ON_PURPOSE = "invoice-balances";

	private static final Pattern XML_NAME = Pattern.compile("<name>\\s*(.*?)\\s*</name>", Pattern.DOTALL);

	// ═════════════════════════════════════════════════════════════════════════════
	// Rule 1 - one cube block per shipped file
	// ═════════════════════════════════════════════════════════════════════════════

	/**
	 * One cube per file, so a folder is a business process and nothing else. The DSL still allows an
	 * author to put named cubes in their own file; the samples do not, because a named cube is only
	 * reachable by typing its name and a user browsing the samples never sees it.
	 */
	@Test
	void everyShippedFileHoldsExactlyOneCube() throws Exception {
		Map<String, CubeOptions> named = new LinkedHashMap<>();
		for (String cubeId : SHIPPED_CUBES) {
			CubeOptions cube = parse(cubeId);
			assertTrue(cube.getSqlTable() != null || cube.getSql() != null,
					cubeId + " must open with an unnamed cube block, on a table or on its own SQL");
			named.putAll(namedCubesIn(cubeId, cube));
		}
		assertEquals(Map.of(), named, "No shipped sample may hold a named cube - one cube per file: " + named);
	}

	/** The negative half: the same checker on a file that does hold a named cube. */
	@Test
	void aFileWithASecondCubeInItIsCaught() throws Exception {
		CubeOptions twoCubes = CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" //
				+ "  sql_table 'cube_demo.erp_invoices'\n" //
				+ "  measure { name 'Invoices'; type 'count' }\n" //
				+ "}\n" //
				+ "cube('payments') {\n" //
				+ "  sql_table 'cube_demo.erp_payments'\n" //
				+ "  measure { name 'Payments'; type 'count' }\n" //
				+ "}");
		assertEquals(List.of("made-up#payments"), new ArrayList<>(namedCubesIn("made-up", twoCubes).keySet()),
				"A named cube beside the unnamed one has to be reported");
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// Rule 2 - no table is the base of two shipped cubes
	// ═════════════════════════════════════════════════════════════════════════════

	/**
	 * A fact table belongs to one cube. Two cubes on the same base table are two answers to the same
	 * question that can drift apart, and the second one is nearly always a filter or a grain that
	 * should have been a segment or a dimension.
	 */
	@Test
	void noTableIsTheBaseOfTwoShippedCubes() throws Exception {
		Map<String, String> baseTables = new LinkedHashMap<>();
		for (String cubeId : SHIPPED_CUBES) {
			if (OVERLAPS_ON_PURPOSE.equals(cubeId)) {
				continue;
			}
			String baseTable = parse(cubeId).getSqlTable();
			assertNotNull(baseTable, cubeId + " is expected to be a table cube");
			baseTables.put(cubeId, baseTable);
		}
		assertEquals(Map.of(), clashesIn(baseTables), "One fact table, one cube: " + clashesIn(baseTables));

		// The exempt cube is exempt because it has its own SQL, not because it was forgotten.
		assertNotNull(parse(OVERLAPS_ON_PURPOSE).getSql(),
				OVERLAPS_ON_PURPOSE + " is exempt from this rule only because it is a SQL cube; if it became a "
						+ "table cube it would have to take its turn like the others");
	}

	/** The negative half: two cubes sharing a base table. */
	@Test
	void twoCubesOnTheSameTableAreCaught() {
		Map<String, String> clashing = new LinkedHashMap<>();
		clashing.put("customer-invoices", "cube_demo.erp_invoices");
		clashing.put("unpaid-invoices", "cube_demo.erp_invoices");
		assertEquals(Map.of("cube_demo.erp_invoices", List.of("customer-invoices", "unpaid-invoices")),
				clashesIn(clashing), "Two cubes on one table have to be reported, with both cube ids");
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// Rule 3 - no shipped cube's own SQL has a WHERE
	// ═════════════════════════════════════════════════════════════════════════════

	/**
	 * A cube is the whole business process. A WHERE inside a cube's own SQL answers one business
	 * question and takes every other question away from the user - and it does it invisibly: the
	 * rows are simply not there and no part of the UI says why. A question that narrows the rows is a
	 * segment, which the user can see and switch off.
	 */
	@Test
	void noShippedCubeFiltersInsideItsOwnSql() throws Exception {
		Map<String, String> filtering = new LinkedHashMap<>();
		for (String cubeId : SHIPPED_CUBES) {
			String ownSql = parse(cubeId).getSql();
			if (ownSql != null && hasOwnWhere(ownSql)) {
				filtering.put(cubeId, ownSql);
			}
		}
		assertEquals(Map.of(), filtering, "A business question belongs in a segment, not in the cube's SQL: "
				+ filtering.keySet());

		// And the rule is not vacuous: at least one shipped cube really does have its own SQL.
		List<String> sqlCubes = new ArrayList<>();
		for (String cubeId : SHIPPED_CUBES) {
			if (parse(cubeId).getSql() != null) {
				sqlCubes.add(cubeId);
			}
		}
		assertTrue(sqlCubes.contains(OVERLAPS_ON_PURPOSE),
				"Expected " + OVERLAPS_ON_PURPOSE + " to be a SQL cube, so this rule has something to check: "
						+ sqlCubes);
	}

	/** The negative half: a cube whose SQL quietly drops the paid invoices. */
	@Test
	void aWhereInsideACubesSqlIsCaught() {
		assertTrue(hasOwnWhere("select i.invoice_id, i.total\n  from cube_demo.erp_invoices i\n"
				+ " where i.status <> 'Paid'"), "A WHERE on the cube's own SELECT has to be caught");
		assertTrue(hasOwnWhere("SELECT * FROM cube_demo.erp_invoices WHERE status = 'Open'"),
				"Case does not hide it");
		assertFalse(hasOwnWhere("select i.invoice_id,\n"
				+ "       (select sum(p.amount) from cube_demo.erp_payments p where p.invoice_id = i.invoice_id) paid\n"
				+ "  from cube_demo.erp_invoices i"),
				"A WHERE inside a bracketed sub-select is how a correlated total is written - it narrows the "
						+ "sub-query, not the cube, so it is not a filter on the cube");
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// Rule 4 - cube.xml <name> is the cube's title
	// ═════════════════════════════════════════════════════════════════════════════

	/**
	 * The name in cube.xml is what /api/cubes hands the UI, so it is the words the user reads in
	 * every list. It has to be the cube's own title: a folder id is a developer's word, and an empty
	 * name makes CubesService fall back to the folder id, which shows the user 'freight-shipments'.
	 */
	@Test
	void everyShippedCubeIsNamedByItsTitle() throws Exception {
		Map<String, String> wrong = new LinkedHashMap<>();
		for (String cubeId : SHIPPED_CUBES) {
			String xmlName = xmlNameOf(cubeId);
			String title = parse(cubeId).getTitle();
			String complaint = complainAboutName(cubeId, xmlName, title);
			if (complaint != null) {
				wrong.put(cubeId, complaint);
			}
		}
		assertEquals(Map.of(), wrong, "cube.xml names the cube for the user: " + wrong);
	}

	/** The negative half: an empty name, a folder id as a name, and a name left behind by a rename. */
	@Test
	void aNameThatIsNotTheTitleIsCaught() {
		assertNotNull(complainAboutName("freight-shipments", "", "Freight Shipments"), "Empty name");
		assertNotNull(complainAboutName("freight-shipments", "freight-shipments", "Freight Shipments"),
				"The folder id is not a name for a user");
		assertNotNull(complainAboutName("freight-shipments", "Shipments", "Freight Shipments"),
				"A name left behind by a rename");
		assertNull(complainAboutName("freight-shipments", "Freight Shipments", "Freight Shipments"),
				"The title itself is the one right answer");
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// Rule 5 - no hint carries cubeName
	// ═════════════════════════════════════════════════════════════════════════════

	/**
	 * A hint names its cube by the folder it sits in. cubeName existed only to pick one of several
	 * cubes inside a file; with one cube per file it can only be wrong, and a wrong one sends the
	 * question to a cube that cannot answer it.
	 */
	@Test
	void noShippedHintNamesACube() throws Exception {
		Map<String, String> withCubeName = new LinkedHashMap<>();
		for (String cubeId : SHIPPED_CUBES) {
			File hints = new File(SAMPLES_CUBES_DIR, cubeId + "/hints.json");
			if (!hints.exists()) {
				continue;
			}
			String json = Files.readString(hints.toPath());
			if (namesACube(json)) {
				withCubeName.put(cubeId, "hints.json still carries cubeName");
			}
		}
		assertEquals(Map.of(), withCubeName, "One cube per file leaves cubeName nothing to say: " + withCubeName);
	}

	/** The negative half: a hint file that still carries one. */
	@Test
	void aHintThatStillNamesACubeIsCaught() {
		assertTrue(namesACube("{ \"hints\": [ { \"id\": \"unpaid\", \"cubeName\": \"invoices\" } ] }"),
				"A hint naming a cube has to be caught");
		assertFalse(namesACube("{ \"hints\": [ { \"id\": \"unpaid\", \"segments\": [\"unpaid\"] } ] }"),
				"A hint without one is fine");
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// The checkers - each one used by a rule and by its negative half
	// ═════════════════════════════════════════════════════════════════════════════

	/** The named cubes of one file, keyed {@code file#key} the way the SQL sweep names them. */
	private Map<String, CubeOptions> namedCubesIn(String cubeId, CubeOptions file) {
		Map<String, CubeOptions> named = new LinkedHashMap<>();
		if (file.getNamedOptions() != null) {
			for (Map.Entry<String, CubeOptions> entry : file.getNamedOptions().entrySet()) {
				named.put(cubeId + "#" + entry.getKey(), entry.getValue());
			}
		}
		return named;
	}

	/** Base table -> the cube ids built on it, for the tables claimed more than once. */
	private Map<String, List<String>> clashesIn(Map<String, String> baseTableByCube) {
		Map<String, List<String>> cubesByTable = new LinkedHashMap<>();
		for (Map.Entry<String, String> entry : baseTableByCube.entrySet()) {
			cubesByTable.computeIfAbsent(entry.getValue().toLowerCase(), table -> new ArrayList<>())
					.add(entry.getKey());
		}
		Map<String, List<String>> clashes = new LinkedHashMap<>();
		for (Map.Entry<String, List<String>> entry : cubesByTable.entrySet()) {
			if (entry.getValue().size() > 1) {
				clashes.put(entry.getKey(), entry.getValue());
			}
		}
		return clashes;
	}

	/**
	 * True when the cube's own SELECT is narrowed by a WHERE. A WHERE inside brackets belongs to a
	 * sub-select - a correlated total, an IN list - and narrows that, not the cube, so the brackets
	 * are counted and only a WHERE at depth zero is a filter on the cube.
	 */
	private boolean hasOwnWhere(String sql) {
		int depth = 0;
		Matcher matcher = Pattern.compile("[()]|\\bwhere\\b", Pattern.CASE_INSENSITIVE).matcher(sql);
		while (matcher.find()) {
			String token = matcher.group();
			if ("(".equals(token)) {
				depth++;
			} else if (")".equals(token)) {
				depth--;
			} else if (depth == 0) {
				return true;
			}
		}
		return false;
	}

	/** What is wrong with the name a cube shows the user, or null when nothing is. */
	private String complainAboutName(String cubeId, String xmlName, String title) {
		if (xmlName == null || xmlName.isBlank()) {
			return "cube.xml has no <name>, so /api/cubes falls back to the folder id '" + cubeId + "'";
		}
		if (xmlName.equals(cubeId)) {
			return "cube.xml names the cube by its folder id, which is a developer's word";
		}
		if (title == null || title.isBlank()) {
			return "the cube has no title to be named by";
		}
		if (!xmlName.equals(title)) {
			return "cube.xml says '" + xmlName + "' but the cube's title is '" + title + "'";
		}
		return null;
	}

	/** True when a hints file still tells a question which cube to use. */
	private boolean namesACube(String hintsJson) {
		return hintsJson.contains("\"cubeName\"");
	}

	private CubeOptions parse(String cubeId) throws Exception {
		File configFile = new File(SAMPLES_CUBES_DIR, cubeId + "/" + cubeId + "-cube-config.groovy");
		assertTrue(configFile.exists(), "A shipped cube with no config file: " + configFile.getAbsolutePath());
		return CubeOptionsParser.parseGroovyCubeDslCode(Files.readString(configFile.toPath()));
	}

	private String xmlNameOf(String cubeId) throws Exception {
		File cubeXml = new File(SAMPLES_CUBES_DIR, cubeId + "/cube.xml");
		assertTrue(cubeXml.exists(), "A shipped cube with no cube.xml: " + cubeXml.getAbsolutePath());
		Matcher matcher = XML_NAME.matcher(Files.readString(cubeXml.toPath()));
		return matcher.find() ? matcher.group(1) : null;
	}
}
