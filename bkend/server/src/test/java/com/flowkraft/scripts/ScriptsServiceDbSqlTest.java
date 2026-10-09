package com.flowkraft.scripts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.flowkraft.queries.services.QueriesService;

/**
 * The scripts the shipped dashboards carry call {@code dbSql} directly, the way a published report's
 * script does, and walk a result with {@code firstRow(sql, [..])} and {@code eachRow}. An inline
 * script run from the Canvas has to answer to the same words.
 */
class ScriptsServiceDbSqlTest {

	private ScriptsService service;

	@BeforeEach
	void setUp() throws Exception {
		QueriesService queries = mock(QueriesService.class);
		when(queries.executeQuery(eq("c1"), anyString(), any())).thenReturn(
				List.of(Map.of("area", "Sales", "target", 10), Map.of("area", "Support", "target", 20)));
		when(queries.withRelativeDays(anyString(), any())).thenAnswer(call -> call.getArgument(1));
		service = new ScriptsService();
		ReflectionTestUtils.setField(service, "queriesService", queries);
		ReflectionTestUtils.setField(service, "timeoutSeconds", 10);
	}

	@Test
	void dbSqlIsBoundWithoutDefiningIt() throws Exception {
		List<Map<String, Object>> rows = service.executeScript("c1", "dbSql.rows('SELECT 1')", null);
		assertEquals(2, rows.size());
	}

	@Test
	void firstRowTakesPositionalParameters() throws Exception {
		List<Map<String, Object>> rows = service.executeScript("c1",
				"def r = dbSql.firstRow('SELECT area FROM t WHERE x = ?', [1]); [[area: r.area]]", null);
		assertEquals("Sales", rows.get(0).get("area"));
	}

	@Test
	void eachRowWalksTheResult() throws Exception {
		List<Map<String, Object>> rows = service.executeScript("c1",
				"def out = []; dbSql.eachRow('SELECT area FROM t') { r -> out << [area: r.area] }; out", null);
		assertEquals(2, rows.size());
		assertEquals("Support", rows.get(1).get("area"));
	}

	@Test
	void aFilterMayNotTakeOverDbSql() {
		assertThrows(IllegalArgumentException.class,
				() -> service.executeScript("c1", "[]", Map.of("dbSql", "x")));
	}

	@Test
	void aDateFilterHeldAsARelativeDayIsReadAsTheDay() throws Exception {
		QueriesService queries = mock(QueriesService.class);
		Map<String, Object> asWritten = Map.of("dateFrom", "{dataToday:startOf year}");
		when(queries.withRelativeDays("c1", asWritten)).thenReturn(Map.of("dateFrom", "2026-01-01"));
		ReflectionTestUtils.setField(service, "queriesService", queries);

		List<Map<String, Object>> rows = service.executeScript("c1", "[[day: dateFrom]]", asWritten);

		assertEquals("2026-01-01", rows.get(0).get("day"));
	}
}
