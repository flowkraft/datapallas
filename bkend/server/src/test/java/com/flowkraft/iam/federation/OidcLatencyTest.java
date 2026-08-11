package com.flowkraft.iam.federation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;

import com.flowkraft.iam.federation.FederatedLoginCatalog.FederatedLogin;

/**
 * The promise that a downloaded DataPallas is unchanged.
 *
 * <p>OIDC ships in every build, which is what makes enabling it a properties change rather than a
 * different artifact. The risk that buys is the opposite failure: a jar that quietly starts behaving
 * like an SSO deployment because the starter happens to be on the classpath. These tests pin the
 * boundary — with no registration configured, nothing is added to the filter chain and the login screen
 * advertises nothing, so authentication stays exactly where it was, against the local SQLite store.
 */
class OidcLatencyTest {

	private final FederatedLoginConfig config = new FederatedLoginConfig();

	// ============================================================
	// nothing configured — the downloaded default
	// ============================================================

	/**
	 * The customizer must not touch {@code HttpSecurity} at all. Passing null proves it: anything that
	 * reached for {@code http.oauth2Login(...)} would fail here.
	 */
	@Test
	void withNoRegistrationTheFilterChainIsNotTouched() throws Exception {

		FederatedLoginCustomizer customizer = config.oidcLoginCustomizer(absent(), null, new OidcProperties());

		assertDoesNotThrow(() -> customizer.apply(null));
	}

	@Test
	void withNoRegistrationTheLoginScreenOffersNoFederatedButton() {

		FederatedLoginCatalog catalog = new FederatedLoginCatalog(absent(), new OidcProperties());

		assertTrue(catalog.getLogins().isEmpty());
	}

	// ============================================================
	// one registration configured
	// ============================================================

	@Test
	void aConfiguredRegistrationBecomesALoginButton() {

		FederatedLoginCatalog catalog = new FederatedLoginCatalog(present(registration("keycloak", "Acme SSO")),
				new OidcProperties());

		assertEquals(1, catalog.getLogins().size());

		FederatedLogin login = catalog.getLogins().get(0);
		assertEquals("keycloak", login.id());
		assertEquals("Acme SSO", login.displayName());
		assertEquals("/oauth2/authorization/keycloak", login.loginUrl());
		assertEquals("oidc", login.protocol());
	}

	/** The label is overridable, because "Acme SSO" is rarely what a client registration is named. */
	@Test
	void theConfiguredDisplayNameOverridesTheClientName() {

		OidcProperties properties = new OidcProperties();
		properties.setDisplayName("Sign in with Acme");

		FederatedLoginCatalog catalog = new FederatedLoginCatalog(present(registration("keycloak", "keycloak-client")),
				properties);

		assertEquals("Sign in with Acme", catalog.getLogins().get(0).displayName());
	}

	@Test
	void everyConfiguredRegistrationIsAdvertised() {

		FederatedLoginCatalog catalog = new FederatedLoginCatalog(
				present(registration("entra", "Entra ID"), registration("okta", "Okta")), new OidcProperties());

		assertEquals(List.of("entra", "okta"), catalog.getLogins().stream().map(FederatedLogin::id).sorted().toList());
	}

	// ============================================================
	// helpers
	// ============================================================

	private ClientRegistration registration(String id, String clientName) {
		return ClientRegistration.withRegistrationId(id)
				.clientId(id + "-client-id")
				.clientName(clientName)
				.authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
				.redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
				.authorizationUri("https://idp.example.com/authorize")
				.tokenUri("https://idp.example.com/token")
				.build();
	}

	private ObjectProvider<ClientRegistrationRepository> absent() {
		return provider(null);
	}

	private ObjectProvider<ClientRegistrationRepository> present(ClientRegistration... registrations) {
		return provider(new InMemoryClientRegistrationRepository(registrations));
	}

	/** Spring ships no test double for ObjectProvider, and only these four methods are ever called. */
	private ObjectProvider<ClientRegistrationRepository> provider(ClientRegistrationRepository value) {
		return new ObjectProvider<>() {

			@Override
			public ClientRegistrationRepository getObject() {
				return value;
			}

			@Override
			public ClientRegistrationRepository getObject(Object... args) {
				return value;
			}

			@Override
			public ClientRegistrationRepository getIfAvailable() {
				return value;
			}

			@Override
			public ClientRegistrationRepository getIfUnique() {
				return value;
			}
		};
	}
}
