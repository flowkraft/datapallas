package com.flowkraft.exploredata;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Finding the script-mode widget in a canvas state — the one thing that decides whether saving or
 * publishing a canvas is, for an author who may not run scripts, running one.
 *
 * <p>The state arrives as a map on a request and as a JSON string out of storage, so both shapes
 * are read here.
 */
public class ScriptModeWidgetsTest {

	private final ObjectMapper objectMapper = new ObjectMapper();

	private static Map<String, Object> widget(String mode) {
		return Map.of("id", "w1", "dataSource", Map.of("mode", mode, "query", "select 1"));
	}

	@Test
	@DisplayName("A SQL-mode canvas has no script in it")
	public void sqlModeIsNotScriptMode() {
		assertFalse(ScriptModeWidgets.presentIn(Map.of("widgets", List.of(widget("sql")))));
	}

	@Test
	@DisplayName("One script-mode widget among several is found")
	public void oneScriptModeWidgetIsEnough() {
		assertTrue(ScriptModeWidgets
				.presentIn(Map.of("widgets", List.of(widget("sql"), widget("script"), widget("sql")))));
	}

	@Test
	@DisplayName("An empty canvas — the one createCanvas always writes — has no script in it")
	public void anEmptyCanvasIsNotScriptMode() {
		assertFalse(ScriptModeWidgets.presentIn(Map.of("widgets", List.of())));
		assertFalse(ScriptModeWidgets.presentIn((Map<String, Object>) null));
		assertFalse(ScriptModeWidgets.presentIn(Map.of("layout", "grid")));
	}

	@Test
	@DisplayName("The same state as the JSON string that storage keeps")
	public void theJsonStringShapeIsReadToo() throws Exception {

		String state = objectMapper.writeValueAsString(Map.of("widgets", List.of(widget("script"))));
		assertTrue(ScriptModeWidgets.presentIn(state, objectMapper));

		String sqlState = objectMapper.writeValueAsString(Map.of("widgets", List.of(widget("sql"))));
		assertFalse(ScriptModeWidgets.presentIn(sqlState, objectMapper));
	}

	@Test
	@DisplayName("A missing or unreadable state is not a canvas with a script in it")
	public void nothingReadableIsNotScriptMode() {
		assertFalse(ScriptModeWidgets.presentIn(null, objectMapper));
		assertFalse(ScriptModeWidgets.presentIn("not json at all", objectMapper));
		assertFalse(ScriptModeWidgets.presentIn(Map.of("widgets", "not a list"), objectMapper));
	}
}
