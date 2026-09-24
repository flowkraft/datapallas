package com.flowkraft.embed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * How a lock travels between the three places that handle it: the stored JSON, the request attribute
 * and the query value the data endpoint reads. A lock written in one shape and read in another is a
 * lock that silently does nothing, so each hop is checked here.
 */
class LockedParamsTest {

	@Test
	void aRequestWithNoCredentialLocksNothing() {
		assertTrue(LockedParams.of(new MockHttpServletRequest()).isEmpty());
		assertTrue(LockedParams.of(null).isEmpty());
	}

	@Test
	void theLocksTheAuthorizationLayerAttachedAreWhatTheControllerReads() {

		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setAttribute(LockedParams.REQUEST_ATTRIBUTE, Map.of("region", "EU"));

		assertEquals(Map.of("region", "EU"), LockedParams.of(request));
	}

	/** Anything else on that attribute is not a lock, and guessing would be worse than ignoring it. */
	@Test
	void anAttributeThatIsNotAMapIsIgnored() {

		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setAttribute(LockedParams.REQUEST_ATTRIBUTE, "region=EU");

		assertTrue(LockedParams.of(request).isEmpty());
	}

	@Test
	void locksSurviveTheTripThroughTheDatabaseColumn() {

		Map<String, Object> locked = new LinkedHashMap<>();
		locked.put("region", "EU");
		locked.put("channel", List.of("web", "retail"));

		assertEquals(locked, LockedParams.fromJson(LockedParams.toJson(locked)));
	}

	@Test
	void nothingToLockIsStoredAsNothing() {
		assertNull(LockedParams.toJson(null));
		assertNull(LockedParams.toJson(Map.of()));
	}

	/**
	 * A link created before locks existed has no column value. It must keep working — unlocked, which
	 * is exactly what it always was — rather than failing to open over a storage detail.
	 */
	@Test
	void aLinkWithoutStoredLocksOpensUnlocked() {
		assertTrue(LockedParams.fromJson(null).isEmpty());
		assertTrue(LockedParams.fromJson("   ").isEmpty());
		assertTrue(LockedParams.fromJson("{not json").isEmpty());
	}

	/** A multi-value parameter reaches the report as one comma-separated value, as from a browser. */
	@Test
	void aLockedListBecomesTheValueTheReportExpects() {
		assertEquals("EU", LockedParams.asQueryValue("EU"));
		assertEquals("web,retail", LockedParams.asQueryValue(List.of("web", "retail")));
		assertEquals("2024", LockedParams.asQueryValue(2024));
		assertEquals("", LockedParams.asQueryValue(null));
	}
}
