package com.flowkraft.iam.federation;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.user.OAuth2User;

/**
 * OIDC sign-in — present in every build, active only when configured.
 *
 * <h2>How "latent" actually works</h2>
 * The OAuth2 client starter is on the classpath of every DataPallas Server, but it does nothing on its
 * own. Spring Boot creates a {@link ClientRegistrationRepository} only when at least one
 * {@code spring.security.oauth2.client.registration.*} exists. A downloaded DataPallas has none, so the
 * bean is never created, the customizer below contributes nothing, and login goes to the local SQLite
 * store exactly as it always did. Turning it on is properties plus a restart — no rebuild, no different
 * artifact, and no flag of our own that could get out of step with the registration itself.
 *
 * <p>The presence check is an {@link ObjectProvider} rather than {@code @ConditionalOnBean} on purpose:
 * conditions are evaluated against whatever has been registered <em>so far</em>, which makes them
 * sensitive to configuration ordering. Asking the context at bean-creation time cannot be fooled that
 * way.
 *
 * <h2>What is deliberately not here</h2>
 * The identity provider's own settings. Those stay under Spring Boot's standard property names so that
 * every Entra ID, Okta, Auth0 and Keycloak guide already describes how to fill them in. Only the part no
 * such guide can cover — which claim carries the groups and what those groups mean in DataPallas — lives
 * in {@link OidcProperties}.
 *
 * <h2>Adding SAML 2.0</h2>
 * Everything a second protocol needs is already here and protocol-neutral: the provisioning rules, the
 * claim reading, the success handler and this seam. SAML would be
 * {@code spring-security-saml2-service-provider} on the classpath — which also means sourcing OpenSAML,
 * since Maven Central stopped mirroring it at 4.0.1 — a {@code SamlProperties} twin of
 * {@link OidcProperties}, and one more {@code @Bean} below that checks for a
 * {@code RelyingPartyRegistrationRepository} and calls {@code http.saml2Login(...)}. Two details that
 * are easy to miss: the SAML callback arrives as a cross-site form POST and so must be exempted from
 * CSRF, and {@code /saml2/**} plus {@code /login/saml2/sso/**} must be permitted pre-authentication.
 */
@Configuration
public class FederatedLoginConfig {

	private static final Logger log = LoggerFactory.getLogger(FederatedLoginConfig.class);

	/** Where the browser leaves for the identity provider, and where it comes back to. */
	public static final String OIDC_LOGIN_PATH = "/oauth2/authorization/**";
	public static final String OIDC_CALLBACK_PATH = "/login/oauth2/code/**";

	@Bean
	public FederatedLoginCustomizer oidcLoginCustomizer(ObjectProvider<ClientRegistrationRepository> registrations,
			FederatedIdentityBridge bridge, OidcProperties properties) {

		if (registrations.getIfAvailable() == null)
			return http -> {
			};

		log.info("OIDC login enabled");

		FederatedLoginSuccessHandler success = new FederatedLoginSuccessHandler(bridge, "OIDC",
				authentication -> authentication.getPrincipal() instanceof OAuth2User user ? user.getAttributes()
						: Map.of(),
				properties.getUsernameClaims(), properties.getGroupsClaims(), properties.getGroupRoleMap(),
				properties.getDefaultRole(), properties.getDefaultTenant());

		return http -> http.oauth2Login(login -> login.successHandler(success)
				// The Angular login route, so a failed federated sign-in lands somewhere that can say so
				// rather than on Spring's generated error page.
				.failureUrl("/#/login?federation=failed"));
	}
}
