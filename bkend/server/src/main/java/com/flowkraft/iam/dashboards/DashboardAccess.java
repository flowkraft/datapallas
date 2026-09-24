package com.flowkraft.iam.dashboards;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.flowkraft.embed.TokenRequest;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.Role;

import jakarta.servlet.http.HttpServletRequest;

/**
 * May this caller open this dashboard?
 *
 * <p>The question only has a "no" for a dashboard viewer, which is the whole design: grants exist to
 * give the weakest role something, not to take anything away from the roles above it. Every other
 * signed-in caller passes through untouched, and reads exactly what they read before.
 *
 * <p>It is called on the four requests that are one act of opening a dashboard — the page, the
 * report's config, its data, and a server-side pivot of it — because a viewer who is refused the page
 * but served the data has not been refused anything.
 *
 * <h2>Token requests are not checked</h2>
 * A request an embed or share token authorised carries no user and no role: the token was verified
 * against one report, which is a tighter limit than any grant. Checking it against a viewer's grants
 * would refuse the share link its own creator sent out.
 */
@Component
public class DashboardAccess {

	private final IamRepository repository;

	private final DashboardGrants grants;

	@Autowired
	public DashboardAccess(IamRepository repository, DashboardGrants grants) {
		this.repository = repository;
		this.grants = grants;
	}

	/** The caller of the request being served. */
	public void check(String reportId, HttpServletRequest request) {
		check(SecurityContextHolder.getContext().getAuthentication(), reportId, request);
	}

	/**
	 * @throws DashboardNotGrantedException 403, when a dashboard viewer asks for a report none of
	 *                                      their groups grants — including a report that is not a
	 *                                      dashboard at all, which is how this closes, for viewers,
	 *                                      the "any signed-in user can read any report" gap
	 */
	public void check(Authentication authentication, String reportId, HttpServletRequest request) {

		if (TokenRequest.isTokenRequest(request))
			return;

		if (!isDashboardViewer(authentication))
			return;

		if (StringUtils.isBlank(reportId))
			throw new DashboardNotGrantedException(StringUtils.defaultString(reportId));

		boolean granted = repository.findUserByUsername(authentication.getName())
				.map(user -> grants.grantedIdsOf(user.id()).contains(reportId)).orElse(false);

		if (!granted || !grants.isPublishedDashboard(reportId))
			throw new DashboardNotGrantedException(reportId);
	}

	/**
	 * A viewer holds ROLE_DASHBOARD_VIEWER and nothing above it.
	 *
	 * <p>Every role is granted its own authority plus every weaker one
	 * ({@code IamUserDetailsService.authoritiesOf}), so an administrator holds ROLE_DASHBOARD_VIEWER
	 * too. Asking for the authority alone would therefore check everybody — and refuse every
	 * administrator their own reports.
	 */
	public boolean isDashboardViewer(Authentication authentication) {

		if (authentication == null || !authentication.isAuthenticated())
			return false;

		return hasAuthority(authentication, Role.DASHBOARD_VIEWER)
				&& !hasAuthority(authentication, Role.JOB_OPERATOR);
	}

	private boolean hasAuthority(Authentication authentication, Role role) {

		String authority = role.authority();
		for (GrantedAuthority granted : authentication.getAuthorities())
			if (authority.equals(granted.getAuthority()))
				return true;

		return false;
	}
}
