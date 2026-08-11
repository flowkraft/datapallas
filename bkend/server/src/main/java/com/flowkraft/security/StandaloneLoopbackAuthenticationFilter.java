package com.flowkraft.security;

import java.io.IOException;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.flowkraft.iam.IamService;
import com.flowkraft.iam.IamUserDetailsService;
import com.flowkraft.iam.model.AppUser;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * In desktop mode, authenticates the caller as the DEFAULT administrator.
 *
 * <h2>Why this is not a hole</h2>
 * This filter only ever runs when {@code RB_ROLE=standalone}, which is the Electron desktop and a
 * single-operator install. In that shape the caller already has the installation directory on their own
 * filesystem: they can read {@code .master-key}, edit any exit-point script and run the CLI directly.
 * A login prompt would protect nothing and would force exactly the "configure your authentication"
 * experience this design exists to avoid.
 *
 * <p>What it does buy is that the rest of the codebase can assume an authenticated principal
 * unconditionally — one code path, one set of {@code @PreAuthorize} rules, no {@code if (isDataPallasServer)}
 * scattered through the controllers.
 *
 * <h2>Why it does NOT default to loopback-only</h2>
 * A tempting hardening is to authenticate only {@code 127.0.0.1}. It breaks the product. DataPallas
 * starts its own Docker containers — the AI Hub, the Grails and WordPress portals, the billing portal —
 * and those call back into this API across the Docker bridge, so their source address is the gateway,
 * never loopback. Under a loopback-only rule every one of them gets a 401 and the Apps tab stops
 * working, on a deployment that by definition has no user accounts to authenticate with instead.
 *
 * <p>So desktop mode keeps the same trust boundary it has always had: the machine. Set
 * {@code DataPallas.security.standalone.loopback-only=true} to narrow it to loopback, accepting that
 * containerised apps then need their own credential.
 */
public class StandaloneLoopbackAuthenticationFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(StandaloneLoopbackAuthenticationFilter.class);

	private final IamService iamService;
	private final IamUserDetailsService userDetailsService;
	private final boolean loopbackOnly;

	public StandaloneLoopbackAuthenticationFilter(IamService iamService, IamUserDetailsService userDetailsService,
			boolean loopbackOnly) {
		this.iamService = iamService;
		this.userDetailsService = userDetailsService;
		this.loopbackOnly = loopbackOnly;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {

		if (SecurityContextHolder.getContext().getAuthentication() == null && (!loopbackOnly || isLoopback(request))) {

			Optional<AppUser> admin = iamService.findUser(AppUser.DEFAULT_USERNAME);

			if (admin.isPresent()) {
				Authentication authentication = new UsernamePasswordAuthenticationToken(admin.get().username(), null,
						userDetailsService.authoritiesOf(admin.get()));

				SecurityContext context = SecurityContextHolder.createEmptyContext();
				context.setAuthentication(authentication);
				SecurityContextHolder.setContext(context);
			} else {
				log.warn("Single-user mode is active but the DEFAULT administrator does not exist");
			}
		}

		chain.doFilter(request, response);
	}

	/**
	 * IPv4 and IPv6 loopback, plus the IPv4-mapped IPv6 form Windows hands back for a localhost
	 * connection.
	 */
	private boolean isLoopback(HttpServletRequest request) {
		String remote = request.getRemoteAddr();
		if (remote == null)
			return false;
		return "127.0.0.1".equals(remote) || "::1".equals(remote) || "0:0:0:0:0:0:0:1".equals(remote)
				|| "::ffff:127.0.0.1".equals(remote);
	}
}
