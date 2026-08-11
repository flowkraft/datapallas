package com.flowkraft.iam.federation;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.web.authentication.preauth.PreAuthenticatedAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/**
 * What happens the moment an identity provider says yes.
 *
 * <p>A redirect-based login hands back a session carrying <em>the provider's</em> idea of who the user
 * is: whatever claim it chose as the principal name, and authorities like {@code SCOPE_openid} or raw
 * group names. Neither is usable as-is. So this handler does the join:
 *
 * <ol>
 *   <li>pick the username out of the claims or attributes;</li>
 *   <li>{@link FederatedIdentityBridge} provisions the local record and returns DataPallas roles;</li>
 *   <li>the session is re-issued with that username and those roles.</li>
 * </ol>
 *
 * <p>Step 3 replaces the {@code SecurityContext} that the login filter has already saved, so it has to
 * be written back through the {@link SecurityContextRepository} rather than only set on the holder —
 * setting the holder alone would be discarded at the end of the request and the user would arrive at the
 * SPA logged out.
 *
 * <p>A user the identity provider vouches for but DataPallas cannot place ends up with no roles. Rather
 * than let them into a UI where every action fails, the session is dropped and they are sent back to the
 * login screen with a reason.
 *
 * <p>Protocol-neutral by construction: the caller supplies a function that flattens its own principal
 * into claims. That is what lets a second protocol reuse every rule above without editing this class —
 * see {@link FederatedLoginCustomizer}.
 */
public class FederatedLoginSuccessHandler implements AuthenticationSuccessHandler {

	private static final Logger log = LoggerFactory.getLogger(FederatedLoginSuccessHandler.class);

	/** The Angular login route, told why it is showing rather than the app. */
	private static final String NO_ACCESS_URL = "/#/login?federation=no-access";

	private final FederatedIdentityBridge bridge;
	private final Function<Authentication, Map<String, Object>> claims;
	private final List<String> usernameKeys;
	private final List<String> groupKeys;
	private final Map<String, String> groupRoleMap;
	private final String defaultRole;
	private final String defaultTenant;
	private final String protocol;

	private final SecurityContextRepository securityContextRepository = new HttpSessionSecurityContextRepository();
	private final SavedRequestAwareAuthenticationSuccessHandler redirect = new SavedRequestAwareAuthenticationSuccessHandler();

	public FederatedLoginSuccessHandler(FederatedIdentityBridge bridge, String protocol,
			Function<Authentication, Map<String, Object>> claims, List<String> usernameKeys, List<String> groupKeys,
			Map<String, String> groupRoleMap, String defaultRole, String defaultTenant) {

		this.bridge = bridge;
		this.protocol = protocol;
		this.claims = claims;
		this.usernameKeys = usernameKeys;
		this.groupKeys = groupKeys;
		this.groupRoleMap = groupRoleMap;
		this.defaultRole = defaultRole;
		this.defaultTenant = defaultTenant;

		// The SPA is one page; deep links inside it are fragments the server never saw, so "/" is always
		// the right landing place when there is no saved request.
		this.redirect.setDefaultTargetUrl("/");
	}

	@Override
	public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
			Authentication authentication) throws IOException, ServletException {

		Map<String, Object> attributes = claims.apply(authentication);

		String username = FederatedClaims.username(attributes, usernameKeys, authentication.getName());

		if (StringUtils.isBlank(username)) {
			log.warn("{} login succeeded but no username claim was found — tried {}", protocol, usernameKeys);
			denyAccess(request, response);
			return;
		}

		Set<String> groups = FederatedClaims.groups(attributes, groupKeys);

		List<GrantedAuthority> authorities = bridge.adopt(username, groups, groupRoleMap, defaultRole, defaultTenant);

		if (authorities.isEmpty()) {
			log.warn("{} user '{}' has no DataPallas role — refusing the session", protocol, username);
			denyAccess(request, response);
			return;
		}

		log.info("{} login for '{}' — groups {} mapped to {}", protocol, username, groups,
				authorities.stream().map(GrantedAuthority::getAuthority).collect(Collectors.joining(", ")));

		// The original token is kept as the credentials so the id token / assertion is not simply thrown
		// away, but the principal and the authorities are now DataPallas's own.
		PreAuthenticatedAuthenticationToken adopted = new PreAuthenticatedAuthenticationToken(username,
				authentication, authorities);
		adopted.setDetails(authentication.getDetails());

		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(adopted);
		SecurityContextHolder.setContext(context);
		securityContextRepository.saveContext(context, request, response);

		redirect.onAuthenticationSuccess(request, response, adopted);
	}

	private void denyAccess(HttpServletRequest request, HttpServletResponse response) throws IOException {

		HttpSession session = request.getSession(false);
		if (session != null)
			session.invalidate();
		SecurityContextHolder.clearContext();

		response.sendRedirect(request.getContextPath() + NO_ACCESS_URL);
	}
}
