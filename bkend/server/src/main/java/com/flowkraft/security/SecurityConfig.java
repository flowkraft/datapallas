package com.flowkraft.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.authorization.AuthenticatedAuthorizationManager;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

import com.flowkraft.embed.EmbedTokenAuthorizationManager;
import com.flowkraft.embed.EmbedTokenService;
import com.flowkraft.embed.ShareTokenService;
import com.flowkraft.iam.IamUserDetailsService;
import com.flowkraft.iam.federation.FederatedLoginConfig;
import com.flowkraft.iam.federation.FederatedLoginCustomizer;

/**
 * The one filter chain, the same in every deployment.
 *
 * <h2>There is only one shape</h2>
 * Desktop, Server on a JDK, Server in Docker, Windows and Linux all run this chain unchanged: a
 * session for browsers, {@code X-API-Key} for machines, and {@code @PreAuthorize} on everything that
 * matters. Nothing here asks which deployment it is in, because the answer never changed what is
 * enforced — only who happens to be calling, and that is a credential, not a configuration.
 *
 * <p>The desktop still feels login-free, and that is a property of the SHELL rather than of this
 * chain: DataPallas.exe holds the installation's API key and signs its own requests with it, so it
 * arrives already authenticated. A caller who does not hold it is refused here, on the desktop
 * exactly as on a server — which is what makes it safe for one folder to be both.
 *
 * <p>{@code DataPallas.security.enabled} can switch the whole chain off; it defaults to true and is
 * meant for a developer running against a throwaway store, never for anything reachable.
 *
 * <h2>Why authorization is at the method level</h2>
 * {@code @EnableMethodSecurity} plus {@code @PreAuthorize} on the controllers, rather than a long list
 * of {@code requestMatchers} here. A path pattern silently stops matching when a mapping is renamed;
 * an annotation on the method cannot drift away from the code it protects. This chain therefore states
 * only what is <em>public</em>, and everything else defaults to authenticated.
 *
 * <h2>CSRF</h2>
 * Enabled for browser sessions via the standard {@code XSRF-TOKEN} cookie, which the Angular
 * {@code ApiService} already reads. API-token requests are exempt: they are stateless, carry no cookie,
 * and so cannot be forged by a third-party page in the first place.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

	private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

	@Autowired
	private ApiKeyManager apiKeyManager;

	@Autowired
	private IamUserDetailsService userDetailsService;

	@Autowired
	private EmbedTokenService embedTokenService;

	@Autowired
	private ShareTokenService shareTokenService;

	/**
	 * Escape hatch for development and for diagnosing a locked-out install. Setting this to false
	 * disables authorization entirely, so it must never be the default in a packaged build.
	 */
	@Value("${DataPallas.security.enabled:true}")
	private boolean securityEnabled;

	/** Declared in {@link PasswordEncoderConfig}, not here — see that class for why it must stay there. */
	@Autowired
	private PasswordEncoder passwordEncoder;

	/**
	 * The single place credentials are checked — and the seam that lets the user store be replaced by
	 * configuration rather than by editing code.
	 *
	 * <p>{@code AuthController} asks this manager rather than checking passwords itself, so swapping
	 * in Active Directory, LDAP or an OIDC provider later means adding another
	 * {@link org.springframework.security.authentication.AuthenticationProvider} to this list behind a
	 * {@code @ConditionalOnProperty} — the login flow, the session handling and the controller all stay
	 * exactly as they are.
	 *
	 * <p>Note what would <em>not</em> move to a directory: roles and tenant membership.
	 * {@code ADMIN} and "belongs to Finance" are DataPallas concepts that no LDAP server knows
	 * about, so a federated setup authenticates against the directory and still authorises against the
	 * local store. {@link IamUserDetailsService} is what joins the two.
	 *
	 * <p>Using {@code DaoAuthenticationProvider} rather than a hand-rolled check also inherits its
	 * defence against username enumeration: it performs a dummy password comparison when the user does
	 * not exist, so a wrong username and a wrong password take the same time to fail.
	 */
	@Bean
	public AuthenticationManager authenticationManager(
			@Autowired(required = false) List<AuthenticationProvider> federatedProviders) {

		DaoAuthenticationProvider localUsers = new DaoAuthenticationProvider();
		localUsers.setUserDetailsService(userDetailsService);
		localUsers.setPasswordEncoder(passwordEncoder);

		List<AuthenticationProvider> providers = new ArrayList<>();

		// LOCAL FIRST, ALWAYS. ProviderManager tries providers in order and stops at the first
		// success, so this ordering is what guarantees two things:
		//
		//   1. An unreachable or misconfigured directory can never lock every administrator out of
		//      the server — a local account remains the break-glass path.
		//   2. Local logins do not wait on a network timeout when the directory is slow.
		//
		// A disabled local account still cannot slip past: DisabledException is an
		// AccountStatusException, which ProviderManager rethrows immediately rather than trying the
		// next provider.
		providers.add(localUsers);

		if (federatedProviders != null)
			providers.addAll(federatedProviders);

		if (providers.size() > 1)
			log.info("Authentication chain: local store first, then {} federated provider(s)",
					providers.size() - 1);

		return new ProviderManager(providers);
	}

	@Bean
	public SecurityFilterChain securityFilterChain(HttpSecurity http,
			@Autowired(required = false) List<FederatedLoginCustomizer> federatedLogins) throws Exception {

		if (!securityEnabled) {
			http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
			return http.build();
		}

		http.cors(cors -> {
		});

		configureCsrf(http);
		configureSessions(http);
		configureFilters(http);
		configureAuthorization(http);

		// Redirect-based sign-in (OIDC, SAML) adds its own filters and callback endpoints, which a
		// provider list cannot express. Each contributes nothing unless a registration for it exists,
		// so on a downloaded DataPallas this loop changes the chain not at all.
		if (federatedLogins != null)
			for (FederatedLoginCustomizer federatedLogin : federatedLogins)
				federatedLogin.apply(http);

		// A browser SPA must get a clean 401 to react to, not a redirect to a login page that does not
		// exist server-side — the login screen is an Angular route. The one exception is a person opening
		// a dashboard link: they are sent to that screen and brought back (SignInRedirectEntryPoint).
		http.exceptionHandling(ex -> ex.authenticationEntryPoint(new SignInRedirectEntryPoint()));

		return http.build();
	}

	// ============================================================
	// pieces
	// ============================================================

	/**
	 * One CSRF posture for every deployment. Desktop used to switch this off on the grounds that it
	 * had no credential worth forging; it has one now — the installation's API key — so the same
	 * protection applies. Key and token callers are exempt below because they carry no ambient
	 * credential a hostile page could borrow.
	 */
	private void configureCsrf(HttpSecurity http) throws Exception {

		CsrfTokenRequestAttributeHandler requestHandler = new CsrfTokenRequestAttributeHandler();
		requestHandler.setCsrfRequestAttributeName(null);

		EmbedTokenAuthorizationManager embedTokens = embedTokenAuthorization();

		http.csrf(csrf -> csrf
				.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
				.csrfTokenRequestHandler(requestHandler)
				// Stateless token callers cannot be CSRF'd — no ambient credential to borrow. An embed
				// token counts only when it is valid for the report the request names.
				.ignoringRequestMatchers(request -> request.getHeader("X-API-Key") != null
						|| request.getHeader("Authorization") != null
						|| embedTokens.carriesValidEmbedToken(request)));
	}

	private EmbedTokenAuthorizationManager embedTokenAuthorization() {
		return new EmbedTokenAuthorizationManager(embedTokenService, shareTokenService,
				AuthenticatedAuthorizationManager.authenticated());
	}

	/**
	 * IF_REQUIRED everywhere: a session is created when somebody signs in with a password and never
	 * otherwise. API-key callers — the Electron shell included — authenticate per request and leave
	 * no session behind, so this costs the desktop nothing while keeping form login working in the
	 * one binary that serves both.
	 */
	private void configureSessions(HttpSecurity http) throws Exception {
		http.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED));
	}

	/**
	 * Authentication is a must in every deployment, so there is exactly one filter here and no mode
	 * gets an identity for free.
	 *
	 * <p>What this deletes matters more than what it adds. Desktop used to install a filter that
	 * authenticated whoever turned up as the default administrator; an installation folder shared with
	 * a DataPallas Server — the compose bundle bind-mounts ./config, so both processes read the same
	 * iam.db — meant starting the Electron shell could serve that server's data with no credential at
	 * all. Now every caller proves who it is: people with a password, machines (the Electron shell
	 * included) with this installation's API key.
	 */
	private void configureFilters(HttpSecurity http) throws Exception {
		http.addFilterBefore(new ApiKeyAuthenticationFilter(apiKeyManager), BasicAuthenticationFilter.class);
	}

	/**
	 * Only what is genuinely public is listed. Everything else needs authentication, and the specific
	 * role comes from {@code @PreAuthorize} on the handler.
	 */
	private void configureAuthorization(HttpSecurity http) throws Exception {
		http.authorizeHttpRequests(auth -> auth
				// Authorize the REQUEST dispatch, and only that one.
				//
				// Most controllers here answer with Mono or Flux while running on the servlet stack,
				// so Spring MVC cannot finish on the request thread: it hands off and completes the
				// response on a second, ASYNC dispatch. Since Spring Security 6 the authorization
				// filter runs on every dispatch type, and on that second pass the SecurityContext is
				// whatever the configured SecurityContextRepository can reload.
				//
				// Somebody who signed in with a password is fine either way: the context comes back
				// from the session on the second pass. An API-key caller is not — and since the
				// desktop is an API-key caller, that is every reactive endpoint in DataPallas.exe.
				// ApiKeyAuthenticationFilter is a OncePerRequestFilter and has already had its one
				// turn, and there is no session to reload from, so authorization sees an anonymous
				// caller and answers 401 AFTER the handler has run: the log really was cleared, the
				// connection really was saved, and the caller is told it was not. To the person at
				// the keyboard it reads as "a login I never asked for is breaking my app" — every
				// reactive endpoint 401s while /api/auth/me cheerfully reports an administrator.
				//
				// It also puts /error out of reach, turning any handler exception into a 401 instead
				// of the real status.
				//
				// This opens nothing. An ASYNC or ERROR dispatch cannot be reached from outside; it
				// exists only because the REQUEST dispatch was authorized and handed off.
				.shouldFilterAllDispatcherTypes(false)

				// The login endpoint itself, and the identity probe. /me must be reachable without a
				// credential because it is what tells the frontend which edition it is talking to —
				// it answers signed in or not, and reveals nothing beyond the deployment mode until
				// someone actually is. /first-run and /bootstrap-admin must be public because on a
				// fresh server there is nobody who could authenticate — /bootstrap-admin is protected
				// by the one-time token file instead, and stops working the moment a user exists.
				.requestMatchers("/api/auth/login", "/api/auth/me", "/api/auth/first-run",
						"/api/auth/bootstrap-admin", "/api/auth/providers").permitAll()

				// The federated round trip: leaving for the identity provider and coming back. Both are
				// pre-authentication by definition. They exist as endpoints only when a registration is
				// configured; listing them unconditionally costs nothing and keeps the chain readable.
				.requestMatchers(FederatedLoginConfig.OIDC_LOGIN_PATH, FederatedLoginConfig.OIDC_CALLBACK_PATH)
				.permitAll()

				// Licensing answers everybody, signed in or not, whatever their role.
				//
				// A licence is a property of the installation rather than of the person looking at it,
				// and the License tab sits on every screen in the product — so gating it means the
				// licence becomes the thing that breaks a page for someone whose only fault was not
				// being an administrator. The desktop, which has no sign-in at all, needs it to answer
				// unconditionally too.
				//
				// Note what this opens: the payload carries the licence key and the customer's email,
				// and activate/deactivate change the installation's licensed state — so a caller who
				// can reach this server can also turn licensing off. That is accepted deliberately,
				// not overlooked. Narrowing the mutations to ADMIN later is one annotation on
				// LicenseController; the reads should stay as they are.
				.requestMatchers("/api/system/license/**").permitAll()

				// Embeddable web components are loaded by third-party pages (Grails, WordPress) that
				// cannot carry a session. They are static assets; the DATA they fetch is still
				// authorized, by API token or share token.
				.requestMatchers("/rb-webcomponents/**", "/geojson/**").permitAll()

				// The Angular bundle and its assets.
				.requestMatchers("/", "/index.html", "/favicon.ico", "/assets/**", "/lib/frend/**").permitAll()
				.requestMatchers(SecurityConfig::isStaticAsset).permitAll()

				// Embedded web components on a third-party page have no session and cannot hold a
				// secret. They present a short-lived token, minted server-side by the page's own
				// backend, that unlocks exactly one report's data — its config, its data, its dashboard
				// and its server-side pivot. Anything without a valid token for the report being
				// requested falls through to normal authentication.
				.requestMatchers("/api/reports/*/config", "/api/reports/*/data", "/dashboard/*",
						"/api/analytics/pivot")
				.access(embedTokenAuthorization())

				.anyRequest().authenticated());
	}

	/**
	 * Static files by extension. Pattern matchers cannot express {@code **}{@code /*.css}, so this is a
	 * predicate — the same approach the previous configuration used, kept deliberately.
	 */
	private static boolean isStaticAsset(jakarta.servlet.http.HttpServletRequest request) {
		String uri = request.getRequestURI();
		return uri != null && (uri.endsWith(".css") || uri.endsWith(".js") || uri.endsWith(".map")
				|| uri.endsWith(".png") || uri.endsWith(".svg") || uri.endsWith(".jpg") || uri.endsWith(".jpeg")
				|| uri.endsWith(".gif") || uri.endsWith(".woff") || uri.endsWith(".woff2") || uri.endsWith(".eot")
				|| uri.endsWith(".ttf") || uri.endsWith(".ico") || uri.startsWith("/.well-known/"));
	}
}
