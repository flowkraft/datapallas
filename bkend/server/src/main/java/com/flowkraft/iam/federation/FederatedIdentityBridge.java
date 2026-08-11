package com.flowkraft.iam.federation;

import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Component;

import com.flowkraft.iam.IamService;
import com.flowkraft.iam.IamUserDetailsService;
import com.flowkraft.iam.model.AppUser;

/**
 * Turns "the identity provider says this is Jane" into "Jane is an REPORT_AUTHOR in Finance".
 *
 * <p>Two steps that must happen in this order and must not be separated:
 *
 * <ol>
 *   <li>{@link FederatedUserProvisioner} gives Jane a local record and a role;</li>
 *   <li>the authorities on the resulting session are re-read from that local record.</li>
 * </ol>
 *
 * <p>Step 2 is the one that is easy to forget and impossible to notice by testing a login. Straight out
 * of an identity provider, an authenticated session carries <em>the provider's</em> authorities —
 * {@code ROLE_Domain-Admins} from LDAP, {@code SCOPE_openid} from OIDC, whatever the SAML assertion
 * happened to include. None of those are DataPallas roles, so every {@code @PreAuthorize} would fail and
 * a federated user would be logged in and able to do nothing. Re-reading the authorities from the local
 * store is what makes the group mapping actually take effect.
 */
@Component
public class FederatedIdentityBridge {

	private final IamService iamService;
	private final IamUserDetailsService userDetailsService;
	private final FederatedUserProvisioner provisioner;

	@Autowired
	public FederatedIdentityBridge(@Lazy IamService iamService, IamUserDetailsService userDetailsService,
			FederatedUserProvisioner provisioner) {
		this.iamService = iamService;
		this.userDetailsService = userDetailsService;
		this.provisioner = provisioner;
	}

	/**
	 * Provision the user and return the authorities their session should carry.
	 *
	 * @return DataPallas authorities, or an empty list if the user could not be placed — an empty list
	 *         means a session with no rights, which is the correct outcome for someone the identity
	 *         provider vouches for but DataPallas cannot situate.
	 */
	public List<GrantedAuthority> adopt(String username, Collection<String> groups, Map<String, String> groupRoleMap,
			String defaultRole, String defaultTenant) {

		provisioner.provision(username, groups, groupRoleMap, defaultRole, defaultTenant);

		return iamService.findUser(username).map(this::authoritiesOf).orElseGet(List::of);
	}

	private List<GrantedAuthority> authoritiesOf(AppUser user) {
		return userDetailsService.authoritiesOf(user);
	}
}
