package com.flowkraft.exploredata;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Whether a canvas has a widget that feeds itself with Groovy.
 *
 * <p>A canvas widget reads its data either from SQL or from a script, and the choice is
 * {@code dataSource.mode} on the widget — the same field {@code ScriptAssembler} reads when it
 * writes the dashboard's dispatcher. A script-mode widget becomes Groovy that the server runs on
 * every view of the exported dashboard, so for an author who may not run scripts, saving or
 * publishing one is the same act as running one.
 */
public final class ScriptModeWidgets {

	private ScriptModeWidgets() {
	}

	/** The canvas state as it arrives on a request: a JSON string, a map, or absent. */
	@SuppressWarnings("unchecked")
	public static boolean presentIn(Object state, ObjectMapper mapper) {

		if (state == null)
			return false;

		try {
			Map<String, Object> stateMap = state instanceof Map
					? (Map<String, Object>) state
					: mapper.readValue(String.valueOf(state), Map.class);
			return presentIn(stateMap);
		} catch (Exception notReadableAsState) {
			// Not a canvas state at all. Whoever stores it says what it is; this only reads widgets.
			return false;
		}
	}

	@SuppressWarnings("unchecked")
	public static boolean presentIn(Map<String, Object> state) {

		if (state == null)
			return false;

		Object widgets = state.get("widgets");
		if (!(widgets instanceof List))
			return false;

		for (Object widget : (List<Object>) widgets)
			if (widget instanceof Map && isScriptMode((Map<String, Object>) widget))
				return true;

		return false;
	}

	private static boolean isScriptMode(Map<String, Object> widget) {
		Object dataSource = widget.get("dataSource");
		return dataSource instanceof Map && "script".equals(String.valueOf(((Map<?, ?>) dataSource).get("mode")));
	}
}
