package com.flowkraft.iam.federation;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;

/**
 * Gives someone authenticated elsewhere a place in DataPallas.
 *
 * <p>Shared by every federation type — LDAP, Active Directory, OIDC and SAML — because the problem is
 * identical in all of them and only the plumbing differs. Whatever authenticated the person can say
 * who they are and, usually, which groups they belong to. None of them can say that they are an
 * REPORT_AUTHOR in the Finance tenant, because tenants and roles are DataPallas concepts. So a federated
 * login is always a join: the identity provider authenticates, and a local record — created here on
 * first sign-in — carries the authorisation.
 *
 * <p>That record deliberately has <b>no password</b>. It exists to hold a membership, and a password
 * on it would be a second way in that bypasses the identity provider entirely.
 */
@Component
public class FederatedUserProvisioner {

	private static final Logger log = LoggerFactory.getLogger(FederatedUserProvisioner.class);

	private final IamRepository repository;

	public FederatedUserProvisioner(IamRepository repository) {
		this.repository = repository;
	}

	/**
	 * Ensure the user has a local record and a role, and keep the role in step with their groups on
	 * every sign-in.
	 *
	 * <p>Re-applying the mapping each time is deliberate: removing someone from the admins group at the
	 * identity provider should take their rights away here too, without anybody remembering to mirror
	 * the change. A role set by hand in DataPallas is preserved only while no group matches.
	 *
	 * @param groups        group or role names as the identity provider reports them
	 * @param groupRoleMap  provider group to DataPallas role; may be empty
	 * @param defaultRole   used on first sign-in when no group matched
	 * @param defaultTenant tenant the user is placed in
	 */
	public void provision(String username, Collection<String> groups, Map<String, String> groupRoleMap,
			String defaultRole, String defaultTenant) {

		String cleanUsername = StringUtils.trimToEmpty(username);
		if (StringUtils.isBlank(cleanUsername))
			return;

		Tenant tenant = repository.findTenantByCode(StringUtils.defaultIfBlank(defaultTenant, Tenant.DEFAULT_CODE))
				.or(() -> repository.findTenantByCode(Tenant.DEFAULT_CODE))
				.orElse(null);

		if (tenant == null) {
			log.error("Cannot place federated user '{}': tenant '{}' does not exist", cleanUsername, defaultTenant);
			return;
		}

		// No password: the identity provider is the only way to authenticate as this person.
		AppUser user = repository.findUserByUsername(cleanUsername).orElseGet(() -> {
			log.info("First sign-in for federated user '{}' — creating a local record", cleanUsername);
			return repository.insertUser(cleanUsername, null, null, false);
		});

		Optional<Role> mapped = roleFromGroups(groups, groupRoleMap);

		if (mapped.isPresent()) {
			repository.upsertMembership(user.id(), tenant.id(), mapped.get());
		} else if (repository.findRole(user.id(), tenant.id()).isEmpty()) {
			repository.upsertMembership(user.id(), tenant.id(), parseRole(defaultRole));
		}
	}

	/**
	 * Strongest matching group wins.
	 *
	 * <p>Someone in both an admins group and a viewers group should be an administrator — taking
	 * whichever the provider listed first would make their access depend on result ordering, which is
	 * not something anybody should have to reason about.
	 */
	public Optional<Role> roleFromGroups(Collection<String> groups, Map<String, String> groupRoleMap) {

		if (groupRoleMap == null || groupRoleMap.isEmpty() || groups == null)
			return Optional.empty();

		Role strongest = null;

		for (String group : groups) {
			if (group == null)
				continue;

			// Spring prefixes authorities with ROLE_; match with or without it so configuration can
			// name the group exactly as the provider does.
			String bare = group.startsWith("ROLE_") ? group.substring("ROLE_".length()) : group;

			for (Map.Entry<String, String> entry : groupRoleMap.entrySet()) {
				if (entry.getKey().equalsIgnoreCase(bare) || entry.getKey().equalsIgnoreCase(group)) {
					Role candidate = parseRole(entry.getValue());
					if (strongest == null || candidate.includes(strongest))
						strongest = candidate;
				}
			}
		}

		return Optional.ofNullable(strongest);
	}

	/** An unrecognised role in configuration must not silently grant more than intended. */
	public Role parseRole(String raw) {
		try {
			Role role = Role.parse(raw);
			if (role == Role.PLATFORM_ADMIN) {
				log.warn("PLATFORM_ADMIN cannot be granted from an identity provider group — using JOB_OPERATOR");
				return Role.JOB_OPERATOR;
			}
			return role;
		} catch (IllegalArgumentException e) {
			log.warn("Unknown role '{}' in the federation configuration — using JOB_OPERATOR", raw);
			return Role.JOB_OPERATOR;
		}
	}
}
