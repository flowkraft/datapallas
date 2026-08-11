package com.flowkraft.iam.ldap;

import java.util.List;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.ldap.DefaultSpringSecurityContextSource;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.GrantedAuthority;

import com.flowkraft.iam.federation.FederatedIdentityBridge;
import org.springframework.security.ldap.authentication.BindAuthenticator;
import org.springframework.security.ldap.authentication.LdapAuthenticationProvider;
import org.springframework.security.ldap.authentication.ad.ActiveDirectoryLdapAuthenticationProvider;
import org.springframework.security.ldap.search.FilterBasedLdapUserSearch;
import org.springframework.security.ldap.userdetails.DefaultLdapAuthoritiesPopulator;

/**
 * Points DataPallas at a corporate directory — and does nothing at all unless asked to.
 *
 * <h2>The default is untouched</h2>
 * Every bean here is {@link ConditionalOnProperty} on {@code datapallas.ldap.enabled=true}. A
 * downloaded DataPallas has no such property, so none of this is constructed and login authenticates
 * against the local SQLite store exactly as before. Switching to a directory is configuration, not a
 * different build.
 *
 * <h2>The local store never stops working</h2>
 * This provider is <em>added</em> to the chain, not substituted for the local one — see
 * {@code SecurityConfig.authenticationManager()}, which always puts local first. Two reasons:
 * <ul>
 *   <li>an unreachable or misconfigured directory would otherwise lock every administrator out of the
 *       server with no way back in;</li>
 *   <li>local logins would otherwise wait on a network timeout whenever the directory is slow.</li>
 * </ul>
 * A local account is the break-glass path, deliberately.
 *
 * <h2>Authentication here, authorisation still local</h2>
 * The directory answers "is this person who they claim to be". It cannot answer "are they an REPORT_AUTHOR in
 * Finance", because tenants and roles are DataPallas concepts. {@link LdapUserProvisioner} creates the
 * local record that carries that, on first sign-in.
 */
@Configuration
@ConditionalOnProperty(prefix = "datapallas.ldap", name = "enabled", havingValue = "true")
public class LdapSecurityConfig {

	private static final Logger log = LoggerFactory.getLogger(LdapSecurityConfig.class);

	/**
	 * The directory provider, wrapped so that a successful authentication also gives the person a place
	 * in DataPallas — and so that the session it produces carries DataPallas roles rather than the
	 * directory's group names.
	 *
	 * <p>Wrapped rather than hooked with an event listener: both of those must happen <em>before</em> the
	 * login endpoint looks the user up, and an {@code AuthenticationSuccessEvent} is published too late
	 * to guarantee it.
	 *
	 * <p>The authority swap is the part that is easy to miss. Left alone, a successful LDAP bind returns
	 * authorities like {@code ROLE_Domain-Admins} — real group names, but not roles this application
	 * knows, so every {@code @PreAuthorize} would refuse and a directory user would be logged in and able
	 * to do nothing at all.
	 */
	@Bean
	public AuthenticationProvider ldapAuthenticationProvider(LdapProperties properties,
			FederatedIdentityBridge bridge) {

		AuthenticationProvider directory = StringUtils.isNotBlank(properties.getDomain())
				? activeDirectory(properties)
				: genericLdap(properties);

		log.info("LDAP authentication enabled against {} ({})", properties.getUrl(),
				StringUtils.isNotBlank(properties.getDomain()) ? "Active Directory" : "generic LDAP");

		return new AuthenticationProvider() {

			@Override
			public Authentication authenticate(Authentication authentication) throws AuthenticationException {

				Authentication authenticated = directory.authenticate(authentication);

				if (authenticated == null || !authenticated.isAuthenticated())
					return authenticated;

				List<String> groups = authenticated.getAuthorities().stream()
						.map(GrantedAuthority::getAuthority).toList();

				List<GrantedAuthority> authorities = bridge.adopt(authenticated.getName(), groups,
						properties.getGroupRoleMap(), properties.getDefaultRole(), properties.getDefaultTenant());

				if (authorities.isEmpty())
					throw new BadCredentialsException("No DataPallas role for directory user");

				UsernamePasswordAuthenticationToken adopted = new UsernamePasswordAuthenticationToken(
						authenticated.getName(), null, authorities);
				adopted.setDetails(authenticated.getDetails());

				return adopted;
			}

			@Override
			public boolean supports(Class<?> authenticationClass) {
				return directory.supports(authenticationClass);
			}
		};
	}

	/**
	 * Active Directory needs almost no configuration: it accepts {@code user@domain} and locates the
	 * account itself, so there are no DN patterns or search filters to get wrong.
	 */
	private AuthenticationProvider activeDirectory(LdapProperties properties) {
		ActiveDirectoryLdapAuthenticationProvider provider = new ActiveDirectoryLdapAuthenticationProvider(
				properties.getDomain(), properties.getUrl(), properties.getBaseDn());

		// A wrong password must read as "invalid credentials", not leak AD's sub-status codes about
		// expired passwords or locked accounts to whoever is guessing.
		provider.setConvertSubErrorCodesToExceptions(false);
		provider.setUseAuthenticationRequestCredentials(true);

		return provider;
	}

	/** OpenLDAP, lldap, 389 Directory, ApacheDS — anything that is not AD. */
	private AuthenticationProvider genericLdap(LdapProperties properties) {

		DefaultSpringSecurityContextSource contextSource = new DefaultSpringSecurityContextSource(
				properties.getUrl() + "/" + StringUtils.trimToEmpty(properties.getBaseDn()));

		if (StringUtils.isNotBlank(properties.getManagerDn())) {
			contextSource.setUserDn(properties.getManagerDn());
			contextSource.setPassword(properties.getManagerPassword());
		}
		contextSource.afterPropertiesSet();

		BindAuthenticator authenticator = new BindAuthenticator(contextSource);

		if (properties.getUserDnPatterns() != null && properties.getUserDnPatterns().length > 0)
			authenticator.setUserDnPatterns(properties.getUserDnPatterns());

		if (StringUtils.isNotBlank(properties.getUserSearchFilter()))
			authenticator.setUserSearch(new FilterBasedLdapUserSearch(
					StringUtils.trimToEmpty(properties.getUserSearchBase()),
					properties.getUserSearchFilter(), contextSource));

		// Only look up groups when they are actually mapped to roles — otherwise it is a directory
		// round-trip on every login whose result nothing reads.
		if (properties.getGroupRoleMap() != null && !properties.getGroupRoleMap().isEmpty()) {
			DefaultLdapAuthoritiesPopulator groups = new DefaultLdapAuthoritiesPopulator(contextSource,
					StringUtils.trimToEmpty(properties.getGroupSearchBase()));
			groups.setGroupSearchFilter(properties.getGroupSearchFilter());
			return new LdapAuthenticationProvider(authenticator, groups);
		}

		return new LdapAuthenticationProvider(authenticator);
	}
}
