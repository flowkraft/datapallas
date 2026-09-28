package com.flowkraft.cubes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;

/**
 * The cube's own row filter: {@code access_filter '<SQL condition>'}.
 *
 * <p>Two things have to be true of it, and the second is the one that is easy to get wrong.
 *
 * <p>It has to be <b>there</b> — on the query, on the filter-options list the generator writes,
 * and on every SELECT the builder produces, for every vendor. A cube whose access filter is
 * missing from one of them answers that one question with everybody's rows.
 *
 * <p>And it has to be <b>bracketed</b>. An author writes {@code a OR b} because that is what
 * "mine or my team's" looks like; dropped into a WHERE next to a filter {@code c} without its own
 * brackets it becomes {@code a OR b AND c}, which SQL reads as {@code a OR (b AND c)} — and every
 * row matching {@code a} comes back, whatever {@code c} said. The negative half of this test takes
 * the generator's brackets away and shows exactly those rows coming back, on a real database, so
 * the bracket is proven to be load-bearing rather than merely present in the text.
 */
class AccessFilterGeneratorTest {

	@TempDir
	Path tempDir;

	/** No {@code ${CUBE}} in it, so the same text is expected back on every vendor. */
	private static final String PLAIN_CONDITION = "ShipCountry IN ('Germany', 'France')";

	/** The shape an author reaches for, and the one that needs the brackets. */
	private static final String OR_CONDITION = "ShipCountry = 'Germany' OR ShipCountry = 'France'";

	private static String cubeDsl(String accessFilterLine) {
		return "cube {\n"
				+ "  sql_table 'Orders'\n"
				+ accessFilterLine
				+ "  dimension { name 'ShipCountry'; sql '${CUBE}.ShipCountry'; type 'string' }\n"
				+ "  dimension { name 'ShipVia'; sql '${CUBE}.ShipVia'; type 'number' }\n"
				+ "  segment { name 'speedyExpress'; sql '${CUBE}.ShipVia = 1' }\n"
				+ "  measure { name 'orders'; type 'count' }\n"
				+ "}";
	}

	private static CubeOptions cubeWith(String condition) throws Exception {
		// The conditions here quote literals, and a Groovy single-quoted string ends at the first
		// quote it meets: an author writing them in a .cube file escapes them the same way.
		return CubeOptionsParser.parseGroovyCubeDslCode(cubeDsl(
				condition == null ? "" : "  access_filter '" + condition.replace("'", "\\'") + "'\n"));
	}

	/** Country and shipper, counted, narrowed by the segment and by a filter — all three at once. */
	private static Map<String, Object> everything() {
		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("ShipCountry", "ShipVia"));
		request.put("measures", List.of("orders"));
		request.put("segments", List.of("speedyExpress"));
		request.put("filters", List.of(Map.of("member", "ShipVia", "operator", "in", "values", List.of(1))));
		return request;
	}

	private static int occurrencesOf(String text, String needle) {
		int count = 0;
		for (int at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length()))
			count++;
		return count;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// It is there, once, in brackets — on every vendor
	// ═══════════════════════════════════════════════════════════════════════════

	@Test
	void ansi_accessFilter_onceAndBracketedInTheWhereOnEveryVendor() throws Exception {

		CubeOptions cube = cubeWith(PLAIN_CONDITION);

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {

			String sql = CubeSqlGenerator.buildQuery(cube, everything(), vendor).toInlineSql(vendor);

			assertEquals(1, occurrencesOf(sql, PLAIN_CONDITION),
					"the access filter is written exactly once on " + vendor + ":\n" + sql);
			assertTrue(sql.contains("WHERE (" + PLAIN_CONDITION + ")"),
					"and it opens the WHERE, in its own brackets, on " + vendor + ":\n" + sql);

			// The segment and the filter are still there, ANDed with it and not replaced by it.
			assertTrue(sql.contains("\n  AND "), "the other conditions are ANDed on " + vendor + ":\n" + sql);
			assertTrue(sql.contains("ShipVia = 1"), "the segment survives on " + vendor + ":\n" + sql);
			assertTrue(sql.contains(" IN (1)") || sql.contains(" IN (1.0)"),
					"and so does the filter on " + vendor + ":\n" + sql);
		}
	}

	@Test
	void ansi_noAccessFilter_theSameTextAsBefore() throws Exception {

		String withFilter = CubeSqlGenerator.buildQuery(cubeWith(PLAIN_CONDITION), everything(), "postgres")
				.toInlineSql("postgres");
		String without = CubeSqlGenerator.buildQuery(cubeWith(null), everything(), "postgres")
				.toInlineSql("postgres");

		assertFalse(without.contains(PLAIN_CONDITION), "nothing is added to a cube that declares none:\n" + without);
		assertEquals(withFilter.replace("(" + PLAIN_CONDITION + ")\n  AND ", ""), without,
				"and the only difference is the one clause:\n" + withFilter + "\n---\n" + without);
	}

	@Test
	void ansi_accessFilter_inTheGeneratedFilterOptionsListToo() throws Exception {

		String sql = CubeSqlGenerator
				.buildQuery(cubeWith(PLAIN_CONDITION), CubeFilterOptions.generatedRequest("ShipCountry", null),
						"sqlite")
				.toInlineSql("sqlite");

		assertTrue(sql.contains("(" + PLAIN_CONDITION + ")"),
				"the values offered for a filter are the values this viewer may see:\n" + sql);
	}

	@Test
	void ansi_accessFilter_itsVariablesStayPlaceholdersInTheText() throws Exception {

		CubeOptions cube = cubeWith("${CUBE}.ShipCountry = ${dp_user_id}");
		String sql = CubeSqlGenerator.buildQuery(cube, everything(), "postgres").toInlineSql("postgres");

		// ${CUBE} is the generator's own and is expanded; ${dp_user_id} is whoever is asking, and
		// nobody is asking at generation time. It travels on, to be bound where the SQL is run.
		assertTrue(sql.contains("${dp_user_id}"), "the variable is left for the binder:\n" + sql);
		assertFalse(sql.contains("${CUBE}"), "and the cube's own self-reference is not:\n" + sql);
	}

	@Test
	void aSecondOneIsAnError() throws Exception {

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(
				cubeDsl("  access_filter '" + PLAIN_CONDITION.replace("'", "\\'")
						+ "'\n  access_filter 'ShipVia = 1'\n"));

		List<String> errors = new ArrayList<>();
		for (Map<String, Object> entry : cube.getWarnings()) {
			if ("error".equals(entry.get("level")) && "access_filter".equals(entry.get("key")))
				errors.add(Objects.toString(entry.get("message"), ""));
		}

		assertEquals(1, errors.size(), "one line, about the one mistake: " + cube.getWarnings());
		assertTrue(errors.get(0).contains("AND or OR"), "and it says what to do instead: " + errors.get(0));

		// The narrower of the two stands until the author fixes the file: the first one written.
		assertEquals(PLAIN_CONDITION, cube.getAccessFilter());
		String sql = CubeSqlGenerator.buildQuery(cube, everything(), "postgres").toInlineSql("postgres");
		assertEquals(1, occurrencesOf(sql, PLAIN_CONDITION), sql);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// The brackets, on a real database: (a OR b) AND c, and what happens without them
	// ═══════════════════════════════════════════════════════════════════════════

	@Test
	void ansi_accessFilter_anOrOfItsOwnRunsBracketedNextToAFilter() throws Exception {

		String sql = CubeSqlGenerator.buildQuery(cubeWith(OR_CONDITION), everything(), "sqlite")
				.toInlineSql("sqlite");

		assertTrue(sql.contains("(" + OR_CONDITION + ")"), "the OR is bracketed:\n" + sql);

		try (Connection connection = northwind()) {
			List<Map<String, Object>> rows = read(connection, sql);

			assertFalse(rows.isEmpty(), "Germany and France ship by Speedy Express in Northwind:\n" + sql);
			for (Map<String, Object> row : rows) {
				assertTrue(List.of("Germany", "France").contains(String.valueOf(row.get("ShipCountry"))),
						"only the countries the access filter allows: " + row);
				assertEquals(1, ((Number) row.get("ShipVia")).intValue(),
						"and only the shipper the filter next to it asks for: " + row);
			}
		}
	}

	@Test
	void ansi_accessFilter_unbracketedTheExcludedRowsComeBack() throws Exception {

		String bracketed = CubeSqlGenerator.buildQuery(cubeWith(OR_CONDITION), everything(), "sqlite")
				.toInlineSql("sqlite");

		// The one difference: the generator's own brackets, taken away. a OR b AND c is read by
		// every database as a OR (b AND c).
		String unbracketed = bracketed.replace("(" + OR_CONDITION + ")", OR_CONDITION);
		assertFalse(unbracketed.equals(bracketed), "the brackets were there to take away:\n" + bracketed);

		try (Connection connection = northwind()) {
			List<Map<String, Object>> safe = read(connection, bracketed);
			List<Map<String, Object>> leaked = read(connection, unbracketed);

			int excluded = 0;
			for (Map<String, Object> row : leaked) {
				if (((Number) row.get("ShipVia")).intValue() != 1)
					excluded++;
			}

			assertTrue(excluded > 0, "without the brackets the rows the filter excludes come back:\n" + unbracketed);
			assertTrue(leaked.size() > safe.size(),
					"and there are more of them than the answer should have: " + leaked.size() + " vs " + safe.size());
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// The fixture
	// ═══════════════════════════════════════════════════════════════════════════

	/** A copy of the SQLite Northwind fixture, so nothing here can write to the canonical file. */
	private Connection northwind() throws Exception {
		Path copy = NorthwindFixture.writableSqliteCopy(tempDir.resolve("northwind.db"));
		return DriverManager.getConnection("jdbc:sqlite:" + copy.toAbsolutePath().toString().replace("\\", "/"));
	}

	private static List<Map<String, Object>> read(Connection connection, String sql) throws Exception {
		List<Map<String, Object>> rows = new ArrayList<>();
		try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery(sql)) {
			int columns = result.getMetaData().getColumnCount();
			while (result.next()) {
				Map<String, Object> row = new LinkedHashMap<>();
				for (int column = 1; column <= columns; column++)
					row.put(result.getMetaData().getColumnLabel(column), result.getObject(column));
				rows.add(row);
			}
		}
		assertNotNull(rows);
		return rows;
	}
}
