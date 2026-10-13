package com.flowkraft.exploredata.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

/**
 * Which lines a filter can be switched off on, and how they then read ({@link SqlParameterLines#offForm}).
 *
 * <p>The rule used to be "a line opening with WHERE, AND or OR becomes {@code WHERE 1=1}, any other
 * line is left out". That wrote broken SQL for every line that is not one whole condition: DD25's
 * {@code sum(CASE WHEN … = ${country} …) AS here,} lost a column, DD10 lost a CASE branch, and
 * DD01's {@code AND x < ${year__next_day})} lost the bracket that closed the line above it. Each of
 * these shipped, and each failed whenever a tile asked without a value.
 */
class SqlParameterLinesOffFormTest {

	@Test
	void aWholeConditionBecomesOneThatIsAlwaysTrue() {
		assertEquals("WHERE 1=1", SqlParameterLines.offForm("WHERE close_date <= ${to}").text());
		assertEquals("  AND 1=1", SqlParameterLines.offForm("  AND amount > ${min}").text());
		assertEquals("OR 1=1", SqlParameterLines.offForm("OR region = ${region}").text());
		assertEquals("HAVING 1=1", SqlParameterLines.offForm("HAVING sum(amount) > ${min}").text());
		// Brackets that open and close on the line, however deep.
		assertEquals("  AND 1=1", SqlParameterLines.offForm("  AND (stage = ${stage} OR (stage IS NULL AND ${all} = 'y'))").text());
		assertEquals("  AND 1=1", SqlParameterLines.offForm("  AND stage IN (${stages})").text());
	}

	@Test
	void aBracketInATextANameOrACommentDoesNotCount() {
		assertEquals("  AND 1=1", SqlParameterLines.offForm("  AND label = ')' || ${p}").text());
		assertEquals("  AND 1=1", SqlParameterLines.offForm("  AND \"odd(name\" = ${p}").text());
		assertEquals("  AND 1=1", SqlParameterLines.offForm("  AND city = ${p} -- (the city the viewer picked").text());
		assertEquals("  AND 1=1", SqlParameterLines.offForm("  AND note = 'it''s (here' AND x = ${p}").text());
	}

	@Test
	void aRowLimitOnALineOfItsOwnIsLeftOut() {
		assertNull(SqlParameterLines.offForm("LIMIT ${topN}").text());
		assertNull(SqlParameterLines.offForm("  OFFSET ${skip} ROWS").text());
		assertNull(SqlParameterLines.offForm("FETCH FIRST ${topN} ROWS ONLY").text());
	}

	@Test
	void anyOtherLineCannotBeSwitchedOff() {
		// DD25: a column of the SELECT.
		assertNull(SqlParameterLines.offForm("  sum(CASE WHEN g.country = ${country} THEN o.revenue ELSE 0 END) AS here,"));
		// DD10: a branch of a CASE.
		assertNull(SqlParameterLines.offForm("    WHEN ${customerType} = 'all' THEN 1"));
		// DD01: a condition whose bracket opens on this line and closes on the next ...
		assertNull(SqlParameterLines.offForm("WHERE (o.order_ts >= ${year}"));
		// ... and the line that closes it, so it never closes a bracket it did not open.
		assertNull(SqlParameterLines.offForm("  AND o.order_ts < ${year__next_day})"));
		// A condition with its connector on the line above.
		assertNull(SqlParameterLines.offForm("  stage = ${stage}"));
		// A LIMIT that is not alone on its line.
		assertNull(SqlParameterLines.offForm("ORDER BY revenue DESC LIMIT ${topN}"));
	}

	@Test
	void theCanvasSaysWhichFilterAndWhichLineInsteadOfSendingBrokenSql() {
		String sql = "SELECT sum(CASE WHEN stage = ${stage} THEN 1 ELSE 0 END) AS here,\n"
				+ "       COUNT(*) AS everyone\n"
				+ "FROM cube_demo.crm_deals";

		SqlParameterLines.FilterLineException refused = assertThrows(SqlParameterLines.FilterLineException.class,
				() -> SqlParameterLines.linesThatApply(sql, List.of("stage"), Map.of("stage", "")));
		assertEquals(List.of("stage"), refused.filters());
		assertEquals("SELECT sum(CASE WHEN stage = ${stage} THEN 1 ELSE 0 END) AS here,", refused.line());
		assertTrue(refused.getMessage().contains("'stage' has no value"), refused.getMessage());

		// With a value there is nothing to switch off: the SQL is the bytes the author wrote.
		assertTrue(sql == SqlParameterLines.linesThatApply(sql, List.of("stage"), Map.of("stage", "Closed Won")));
	}

	@Test
	void anEmptyFilterOnAWholeConditionStillKeepsTheQueryWhole() {
		String sql = "SELECT COUNT(*)\nFROM t\nWHERE a = ${a}\n  AND b IN (${b})\nLIMIT ${n}";
		assertEquals("SELECT COUNT(*)\nFROM t\nWHERE 1=1\n  AND 1=1",
				SqlParameterLines.linesThatApply(sql, List.of("a", "b", "n"), Map.of("a", "", "b", " , ", "n", "")));
	}
}
