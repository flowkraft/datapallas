package com.flowkraft.iam.federation;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;

/**
 * A federated sign-in that wants to add itself to the one filter chain.
 *
 * <p>OIDC and SAML cannot be added the way LDAP is. LDAP is a plain
 * {@link org.springframework.security.authentication.AuthenticationProvider}: a username and password
 * arrive at {@code /api/auth/login} and something either accepts them or does not, so it is enough to
 * append a provider to the list. OIDC and SAML have no password to pass on — the browser leaves for the
 * identity provider and comes back to a callback endpoint — which means filters, callback URLs and
 * redirect handling, all of which live on {@code HttpSecurity} rather than in a provider list.
 *
 * <p>Hence this seam. {@code SecurityConfig} still owns the single chain and knows nothing about either
 * protocol; each implementation contributes its own filters, and contributes nothing when the protocol
 * is not configured.
 */
public interface FederatedLoginCustomizer {

	void apply(HttpSecurity http) throws Exception;
}
