package com.flowkraft.iam.federation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

/**
 * Reading a username and a group list out of whatever an identity provider actually sent.
 *
 * <p>This is the part of federated login that breaks in the field, and it breaks silently: a claim the
 * code cannot read means the user signs in successfully and lands with the default role, so the symptom
 * is "our admins have no admin rights" rather than an error anybody can act on. Every shape below is one
 * a real provider emits.
 */
class FederatedClaimsTest {

	private static final List<String> USERNAME_CLAIMS = List.of("preferred_username", "email", "sub");
	private static final List<String> GROUP_CLAIMS = List.of("groups", "roles");

	// ============================================================
	// username
	// ============================================================

	@Test
	void theFirstCandidateClaimWins() {

		String username = FederatedClaims.username(
				claims("preferred_username", "jane.smith", "email", "jane@example.com"), USERNAME_CLAIMS, null);

		assertEquals("jane.smith", username);
	}

	/** Keycloak and Okta populate preferred_username; a bare OAuth2 provider may only have email. */
	@Test
	void aLaterCandidateIsUsedWhenTheEarlierOnesAreAbsent() {

		assertEquals("jane@example.com",
				FederatedClaims.username(claims("email", "jane@example.com"), USERNAME_CLAIMS, null));
	}

	/** A claim present but blank is not an answer — it must not shadow the next candidate. */
	@Test
	void aBlankClaimIsSkipped() {

		assertEquals("jane@example.com", FederatedClaims
				.username(claims("preferred_username", "   ", "email", "jane@example.com"), USERNAME_CLAIMS, null));
	}

	/**
	 * With nothing readable, the caller's fallback is the provider's own principal name. It is opaque,
	 * but a stable opaque username beats refusing a login that the provider approved.
	 */
	@Test
	void theFallbackIsUsedWhenNoClaimMatches() {

		assertEquals("fallback-principal",
				FederatedClaims.username(claims("nickname", "jane"), USERNAME_CLAIMS, "fallback-principal"));
	}

	@Test
	void aMissingUsernameAndNoFallbackIsNull() {

		assertNull(FederatedClaims.username(Map.of(), USERNAME_CLAIMS, null));
		assertNull(FederatedClaims.username(null, USERNAME_CLAIMS, "  "));
	}

	/** SAML-style attributes arrive as single-element lists even for scalars. */
	@Test
	void aScalarWrappedInAListIsUnwrapped() {

		assertEquals("jane.smith",
				FederatedClaims.username(claims("preferred_username", List.of("jane.smith")), USERNAME_CLAIMS, null));
	}

	// ============================================================
	// groups
	// ============================================================

	@Test
	void aJsonArrayOfGroupsIsRead() {

		Set<String> groups = FederatedClaims.groups(claims("groups", List.of("Finance-Admins", "All-Staff")),
				GROUP_CLAIMS);

		assertEquals(Set.of("Finance-Admins", "All-Staff"), groups);
	}

	/** A provider configured to emit one group emits a string, not a one-element array. */
	@Test
	void aSingleGroupAsAPlainStringIsRead() {

		assertEquals(Set.of("Finance-Admins"), FederatedClaims.groups(claims("groups", "Finance-Admins"), GROUP_CLAIMS));
	}

	/** Some providers pack several groups into one claim rather than emitting an array. */
	@Test
	void aCommaOrSemicolonSeparatedClaimIsSplit() {

		assertEquals(Set.of("Finance-Admins", "All-Staff"),
				FederatedClaims.groups(claims("groups", "Finance-Admins, All-Staff"), GROUP_CLAIMS));

		assertEquals(Set.of("A", "B", "C"), FederatedClaims.groups(claims("groups", "A;B;C"), GROUP_CLAIMS));
	}

	/** Entra ID emits group claims as objects when asked for more than the id. */
	@Test
	void groupsGivenAsObjectsAreReadByDisplayName() {

		Set<String> groups = FederatedClaims.groups(
				claims("groups", List.of(Map.of("id", "8f1c…", "displayName", "Finance-Admins"))), GROUP_CLAIMS);

		assertEquals(Set.of("Finance-Admins"), groups);
	}

	/**
	 * A user can be described by more than one claim — {@code groups} for directory membership and
	 * {@code roles} for app-assigned roles is a normal Entra ID setup — so both are read, not just the
	 * first one found.
	 */
	@Test
	void everyCandidateClaimContributes() {

		Set<String> groups = FederatedClaims
				.groups(claims("groups", List.of("All-Staff"), "roles", List.of("DataPallas-Author")), GROUP_CLAIMS);

		assertEquals(Set.of("All-Staff", "DataPallas-Author"), groups);
	}

	@Test
	void noGroupsClaimYieldsAnEmptySetRatherThanNull() {

		assertTrue(FederatedClaims.groups(Map.of(), GROUP_CLAIMS).isEmpty());
		assertTrue(FederatedClaims.groups(null, GROUP_CLAIMS).isEmpty());
		assertTrue(FederatedClaims.groups(claims("groups", ""), GROUP_CLAIMS).isEmpty());
	}

	/** Nulls inside the array — seen from providers that emit sparse group lists. */
	@Test
	void nullsAndBlanksInsideTheListAreDropped() {

		Set<String> groups = FederatedClaims
				.groups(claims("groups", java.util.Arrays.asList("Finance-Admins", null, "  ", "All-Staff")),
						GROUP_CLAIMS);

		assertEquals(Set.of("Finance-Admins", "All-Staff"), groups);
	}

	// ============================================================
	// helpers
	// ============================================================

	private Map<String, Object> claims(Object... keysAndValues) {
		Map<String, Object> claims = new LinkedHashMap<>();
		for (int i = 0; i + 1 < keysAndValues.length; i += 2)
			claims.put((String) keysAndValues[i], keysAndValues[i + 1]);
		return claims;
	}
}
