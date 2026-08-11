package com.flowkraft.iam.federation;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * The DataPallas half of an OIDC setup — {@code datapallas.oidc.*}.
 *
 * <p>Deliberately <em>not</em> where the identity provider is configured. Client id, secret, issuer and
 * scopes go under Spring Boot's own {@code spring.security.oauth2.client.registration.*} /
 * {@code .provider.*}, because that is the documented, well-known place and every Entra/Okta/Auth0/
 * Keycloak guide on the internet already tells people to put them there. Inventing a parallel set of
 * property names would only mean their existing notes stop applying.
 *
 * <p>What is left here is the part no OIDC guide can tell them: which claim carries the groups, and how
 * those groups become DataPallas roles.
 *
 * <p>None of this does anything on its own. OIDC login is only wired when at least one
 * {@code spring.security.oauth2.client.registration.*} exists, so a downloaded DataPallas — which has
 * none — authenticates against its local SQLite store exactly as before.
 */
@Component
@ConfigurationProperties(prefix = "datapallas.oidc")
public class OidcProperties {

	/**
	 * Claims to try, in order, for the username. {@code preferred_username} is what Keycloak, Entra ID
	 * and Okta all populate; {@code email} is the usual fallback; {@code sub} always exists but is an
	 * opaque identifier, so it is last.
	 */
	private List<String> usernameClaims = List.of("preferred_username", "email", "sub");

	/**
	 * Claim holding the user's groups or roles. {@code groups} is the convention across Okta, Auth0,
	 * Keycloak and Entra ID — though each needs to be told to emit it, since none do by default.
	 */
	private List<String> groupsClaims = List.of("groups", "roles");

	/** Provider group to DataPallas role, e.g. {@code datapallas.oidc.group-role-map.Finance-Admins=ADMIN}. */
	private Map<String, String> groupRoleMap = new LinkedHashMap<>();

	/** Given on first sign-in when no group matched. The least privileged role, on purpose. */
	private String defaultRole = "JOB_OPERATOR";

	/** Tenant a federated user is placed in. */
	private String defaultTenant = "default";

	/** Label for the button on the login screen. Falls back to the registration's own client name. */
	private String displayName;

	public List<String> getUsernameClaims() {
		return usernameClaims;
	}

	public void setUsernameClaims(List<String> usernameClaims) {
		this.usernameClaims = usernameClaims;
	}

	public List<String> getGroupsClaims() {
		return groupsClaims;
	}

	public void setGroupsClaims(List<String> groupsClaims) {
		this.groupsClaims = groupsClaims;
	}

	public Map<String, String> getGroupRoleMap() {
		return groupRoleMap;
	}

	public void setGroupRoleMap(Map<String, String> groupRoleMap) {
		this.groupRoleMap = groupRoleMap;
	}

	public String getDefaultRole() {
		return defaultRole;
	}

	public void setDefaultRole(String defaultRole) {
		this.defaultRole = defaultRole;
	}

	public String getDefaultTenant() {
		return defaultTenant;
	}

	public void setDefaultTenant(String defaultTenant) {
		this.defaultTenant = defaultTenant;
	}

	public String getDisplayName() {
		return displayName;
	}

	public void setDisplayName(String displayName) {
		this.displayName = displayName;
	}
}
