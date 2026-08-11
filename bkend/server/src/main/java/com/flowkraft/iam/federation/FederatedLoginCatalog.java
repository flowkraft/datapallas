package com.flowkraft.iam.federation;

import java.util.ArrayList;
import java.util.List;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.stereotype.Component;

/**
 * Which "Sign in with…" buttons the login screen should show.
 *
 * <p>Read off the registrations that are actually configured, never from a separate list. An
 * administrator who adds an Okta registration gets the button without also having to declare it
 * somewhere else, and — more to the point — a button can never appear for a provider that would fail on
 * click.
 *
 * <p>On a downloaded DataPallas there are no registrations, so this is empty and the login screen shows
 * nothing but the username and password fields.
 */
@Component
public class FederatedLoginCatalog {

	private static final Logger log = LoggerFactory.getLogger(FederatedLoginCatalog.class);

	/** What the login screen needs: a label and where to send the browser. */
	public record FederatedLogin(String id, String displayName, String loginUrl, String protocol) {
	}

	private final List<FederatedLogin> logins;

	public FederatedLoginCatalog(ObjectProvider<ClientRegistrationRepository> oidcRegistrations,
			OidcProperties oidcProperties) {

		List<FederatedLogin> found = new ArrayList<>();

		// Only the in-memory repository Spring Boot builds from properties is enumerable; anything else
		// still works for signing in, it just cannot advertise itself.
		if (oidcRegistrations.getIfAvailable() instanceof Iterable<?> registrations)
			for (Object entry : registrations)
				if (entry instanceof ClientRegistration registration)
					found.add(new FederatedLogin(registration.getRegistrationId(),
							StringUtils.firstNonBlank(oidcProperties.getDisplayName(),
									registration.getClientName(), registration.getRegistrationId()),
							"/oauth2/authorization/" + registration.getRegistrationId(), "oidc"));

		this.logins = List.copyOf(found);

		if (!logins.isEmpty())
			log.info("Federated sign-in available: {}", logins.stream().map(FederatedLogin::id).toList());
	}

	public List<FederatedLogin> getLogins() {
		return logins;
	}
}
