package com.flowkraft.iam.limits;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * The shape of a group's limits.
 *
 * <p>Every case here is a decision an admin can make on the Groups form, plus the one case nobody
 * makes on purpose: a key the server does not know. That one matters most — a limit that saves but is
 * never enforced would show on the screen as protection that does not exist.
 */
class LimitSettingsTest {

	@Test
	void emptyObjectSetsNoLimits() {
		LimitSettings settings = LimitSettings.parse("{}");

		assertTrue(settings.setsNoLimits());
		assertTrue(settings.allowsAllConnections());
		assertTrue(settings.allowsScripts());
		assertNull(settings.getConnections());
		assertNull(settings.getScripts());
	}

	@Test
	void blankAndNullAreReadAsEmpty() {
		assertTrue(LimitSettings.parse(null).setsNoLimits());
		assertTrue(LimitSettings.parse("").setsNoLimits());
		assertTrue(LimitSettings.parse("   ").setsNoLimits());
	}

	@Test
	void connectionsAreRead() {
		LimitSettings settings = LimitSettings.parse("{\"connections\":[\"sales-pg\",\"hr-mysql\"]}");

		assertFalse(settings.setsNoLimits());
		assertFalse(settings.allowsAllConnections());
		assertTrue(settings.allowsConnection("sales-pg"));
		assertTrue(settings.allowsConnection("hr-mysql"));
		assertFalse(settings.allowsConnection("finance-oracle"));
		// A connection limit says nothing about scripts.
		assertTrue(settings.allowsScripts());
	}

	@Test
	void anEmptyConnectionListAllowsNone() {
		LimitSettings settings = LimitSettings.parse("{\"connections\":[]}");

		assertFalse(settings.setsNoLimits());
		assertFalse(settings.allowsAllConnections());
		assertFalse(settings.allowsConnection("sales-pg"));
		assertEquals(List.of(), settings.connectionsOrEmpty());
	}

	@Test
	void missingConnectionsAllowsAll() {
		LimitSettings settings = LimitSettings.parse("{\"scripts\":false}");

		assertTrue(settings.allowsAllConnections());
		assertTrue(settings.allowsConnection("anything-at-all"));
		assertEquals(List.of(), settings.connectionsOrEmpty());
	}

	@Test
	void scriptsIsRead() {
		assertFalse(LimitSettings.parse("{\"scripts\":false}").allowsScripts());
		assertTrue(LimitSettings.parse("{\"scripts\":true}").allowsScripts());
		// Set explicitly to true, the group still limits — it just does not limit scripts.
		assertFalse(LimitSettings.parse("{\"scripts\":true}").setsNoLimits());
	}

	@Test
	void bothFieldsTogether() {
		LimitSettings settings = LimitSettings.parse("{\"connections\":[\"sales-pg\"],\"scripts\":false}");

		assertTrue(settings.allowsConnection("sales-pg"));
		assertFalse(settings.allowsConnection("hr-mysql"));
		assertFalse(settings.allowsScripts());
	}

	@Test
	void anUnknownKeyIsRefused() {
		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> LimitSettings.parse("{\"maxRows\":1000}"));

		assertTrue(refused.getMessage().contains("maxRows"), refused.getMessage());
		assertTrue(refused.getMessage().contains("connections"), refused.getMessage());
	}

	@Test
	void theDroppedSettingsAreRefusedByName() {
		for (String dropped : List.of("queryTimeoutSeconds", "maxRows", "maxConcurrentQueries")) {
			IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
					() -> LimitSettings.parse("{\"" + dropped + "\":1}"), dropped);
			assertTrue(refused.getMessage().contains(dropped), refused.getMessage());
		}
	}

	@Test
	void aTypoIsRefusedRatherThanReadAsNoLimit() {
		// "connection" without the s would otherwise save as {} — a group the admin believes limits
		// connections and that in fact limits nothing.
		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> LimitSettings.parse("{\"connection\":[\"sales-pg\"]}"));

		assertTrue(refused.getMessage().contains("connection"), refused.getMessage());
	}

	@Test
	void malformedJsonIsRefused() {
		assertThrows(IllegalArgumentException.class, () -> LimitSettings.parse("{"));
		assertThrows(IllegalArgumentException.class, () -> LimitSettings.parse("not json"));
	}

	@Test
	void nothingSetWritesAsAnEmptyObject() {
		assertEquals("{}", new LimitSettings().toJson());
	}

	@Test
	void whatIsWrittenReadsBackTheSame() {
		LimitSettings settings = new LimitSettings();
		settings.setConnections(List.of("sales-pg", "hr-mysql"));
		settings.setScripts(false);

		LimitSettings readBack = LimitSettings.parse(settings.toJson());

		assertEquals(List.of("sales-pg", "hr-mysql"), readBack.getConnections());
		assertEquals(Boolean.FALSE, readBack.getScripts());
		assertFalse(readBack.allowsScripts());
	}

	@Test
	void anEmptyConnectionListSurvivesTheRoundTrip() {
		LimitSettings settings = new LimitSettings();
		settings.setConnections(List.of());

		LimitSettings readBack = LimitSettings.parse(settings.toJson());

		// "no connections at all" must not come back as "all connections".
		assertFalse(readBack.allowsAllConnections());
		assertFalse(readBack.allowsConnection("sales-pg"));
	}
}
