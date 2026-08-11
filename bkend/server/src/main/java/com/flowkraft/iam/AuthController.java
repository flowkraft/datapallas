package com.flowkraft.iam;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.iam.dtos.IdentityDto;
import com.flowkraft.iam.federation.FederatedLoginCatalog;
import com.flowkraft.iam.dtos.LoginRequestDto;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;

/**
 * Login, logout, and "who am I".
 *
 * <p>Session-based rather than token-based on purpose. The Angular app is served same-origin by this
 * very server in web mode, so a session cookie plus CSRF is the standard Spring pattern and needs no
 * token storage in the browser. Machine callers use an API token instead.
 */
@RestController
@RequestMapping(value = "/api/auth", produces = MediaType.APPLICATION_JSON_VALUE)
public class AuthController {

	private static final Logger log = LoggerFactory.getLogger(AuthController.class);

	@Autowired
	private IamService iamService;

	@Autowired
	private AuthenticationManager authenticationManager;

	@Autowired
	private FederatedLoginCatalog federatedLoginCatalog;

	private final SecurityContextRepository securityContextRepository = new HttpSessionSecurityContextRepository();

	/**
	 * Authenticate and start a session.
	 *
	 * <p>Credentials are checked by the {@link AuthenticationManager}, never here. That indirection is
	 * the whole point: it means the user store is a configuration choice. Pointing DataPallas at Active
	 * Directory or LDAP later is a matter of registering another provider — this method, the session
	 * handling and the frontend all stay untouched.
	 *
	 * <p>Answers 401 for a bad username, a bad password and a disabled account alike. Telling a caller
	 * which of the three it was only helps them enumerate accounts, and Spring's
	 * {@code DaoAuthenticationProvider} keeps the timings equal too.
	 */
	@PostMapping("/login")
	public ResponseEntity<?> login(@Valid @RequestBody LoginRequestDto request, HttpServletRequest httpRequest,
			HttpServletResponse httpResponse) {

		Authentication authentication;
		try {
			authentication = authenticationManager.authenticate(
					new UsernamePasswordAuthenticationToken(request.username(), request.password()));

		} catch (AuthenticationException e) {
			log.info("Failed login attempt for '{}'", request.username());
			return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Invalid credentials"));
		}

		// The principal exists in the directory that authenticated it; the local store is what says
		// which tenant they belong to and what they may do there. With a federated provider the two
		// can be different systems, which is exactly why this lookup is separate from the check above.
		Optional<AppUser> found = iamService.findUser(authentication.getName());
		if (found.isEmpty()) {
			log.warn("Authenticated '{}' has no local record — no tenant membership to authorise",
					authentication.getName());
			return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Invalid credentials"));
		}

		AppUser user = found.get();

		// A fresh session for a fresh login — reusing the pre-login session id would leave the app open
		// to session fixation.
		HttpSession existing = httpRequest.getSession(false);
		if (existing != null)
			existing.invalidate();
		httpRequest.getSession(true);

		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(authentication);
		SecurityContextHolder.setContext(context);
		securityContextRepository.saveContext(context, httpRequest, httpResponse);

		log.info("User '{}' logged in", user.username());

		return ResponseEntity.ok(identityFor(user, authentication.getAuthorities()));
	}

	/**
	 * Tells the login screen whether the shipped {@code burst}/{@code burst} account is still in use,
	 * so it can state the credentials and warn about them.
	 *
	 * <p>Public by necessity — it is read before anyone can sign in. It gives nothing away: while it
	 * answers true, the credentials it names are the documented defaults that anyone could try anyway;
	 * the moment the password changes it answers false and names nothing.
	 */
	@GetMapping("/first-run")
	public ResponseEntity<Map<String, Object>> defaultCredentialsStatus() {

		boolean usingDefaults = iamService.isUsingDefaultCredentials();

		return ResponseEntity.ok(usingDefaults
				? Map.of("usingDefaultCredentials", true,
						"defaultUsername", IamService.DEFAULT_SERVER_USERNAME,
						"defaultPassword", IamService.DEFAULT_SERVER_PASSWORD)
				: Map.of("usingDefaultCredentials", false));
	}

	/**
	 * The "Sign in with…" buttons to render, if any.
	 *
	 * <p>Empty on a downloaded DataPallas, which is the point: the login screen asks for a username and
	 * password and shows nothing else until someone configures an identity provider, at which point the
	 * button appears without any further change here or in the frontend.
	 */
	@GetMapping("/providers")
	public ResponseEntity<List<FederatedLoginCatalog.FederatedLogin>> federatedLogins() {
		return ResponseEntity.ok(federatedLoginCatalog.getLogins());
	}

	@PostMapping("/logout")
	public ResponseEntity<Void> logout(HttpServletRequest httpRequest) {
		HttpSession session = httpRequest.getSession(false);
		if (session != null)
			session.invalidate();
		SecurityContextHolder.clearContext();
		return ResponseEntity.ok().build();
	}

	/**
	 * The frontend's bootstrap call, and the one endpoint that must answer everybody.
	 *
	 * <p>It always returns 200, never 401. A 401 carries no {@code mode}, and without the mode the
	 * frontend cannot tell the two editions apart: DataPallas Desktop, where nobody signs in because
	 * there is nothing to sign in to, looks exactly like a DataPallas Server whose session has expired.
	 * Whichever way it guesses is wrong for the other one — either a login screen flashes at a desktop
	 * user, or a signed-out server user is let straight through to empty screens with no way to log in.
	 * Answering {@code mode} with {@code authenticated:false} removes the guess, and gives nothing away:
	 * the login screen already states the default credentials outright.
	 *
	 * <p>In {@code STANDALONE} the loopback caller has already been authenticated by the filter chain,
	 * so this returns a full identity without any login step — which is what lets the desktop show no
	 * authentication UI at all.
	 */
	@GetMapping("/me")
	public ResponseEntity<IdentityDto> me() {

		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

		if (authentication == null || !authentication.isAuthenticated()
				|| "anonymousUser".equals(authentication.getPrincipal()))
			return ResponseEntity.ok(anonymousIdentity());

		Optional<AppUser> user = iamService.findUser(authentication.getName());
		if (user.isEmpty())
			return ResponseEntity.ok(machineIdentity(authentication));

		return ResponseEntity.ok(identityFor(user.get(), authentication.getAuthorities()));
	}

	// ============================================================
	// identity assembly
	// ============================================================

	/**
	 * Nobody is signed in. Only {@code mode} carries information — every other field is the closed
	 * answer, so a frontend that renders straight from this DTO shows nothing it should not.
	 */
	private IdentityDto anonymousIdentity() {
		return new IdentityDto(iamService.getMode().wireName(), false, null, null, List.of(), noCapabilities(),
				Map.of());
	}

	/**
	 * An authenticated caller with no record in the local store: a machine, not a person — the
	 * installation API key, or an embedding app. It has authorities, so report them.
	 *
	 * <p>The alternative, refusing to answer, is worse than it looks: the caller <em>is</em>
	 * authenticated and its requests do succeed, so a 401 here would send a client hunting for a login
	 * it does not need and cannot perform. There is no tenant membership to report, so the default
	 * tenant stands in.
	 */
	private IdentityDto machineIdentity(Authentication authentication) {

		List<String> roles = rolesOf(authentication.getAuthorities());
		Tenant tenant = iamService.findTenant(Tenant.DEFAULT_CODE).orElse(null);

		return new IdentityDto(iamService.getMode().wireName(), true,
				new IdentityDto.UserDto(authentication.getName(), null, false),
				tenant == null ? null : new IdentityDto.TenantDto(tenant.code(), tenant.displayName()), roles,
				capabilitiesOf(roles), Map.of());
	}

	private IdentityDto identityFor(AppUser user, java.util.Collection<? extends GrantedAuthority> authorities) {

		List<String> roles = rolesOf(authorities);

		Map<String, Role> memberships = iamService.membershipsOf(user.id());

		Tenant tenant = memberships.keySet().stream().findFirst().flatMap(iamService::findTenant)
				.orElseGet(() -> iamService.findTenant(Tenant.DEFAULT_CODE).orElse(null));

		Map<String, String> membershipsOnTheWire = new LinkedHashMap<>();
		memberships.forEach((code, role) -> membershipsOnTheWire.put(code, role.name()));

		return new IdentityDto(
				iamService.getMode().wireName(),
				true,
				new IdentityDto.UserDto(user.username(), user.email(), user.platformAdmin()),
				tenant == null ? null : new IdentityDto.TenantDto(tenant.code(), tenant.displayName()),
				roles,
				capabilitiesOf(roles),
				membershipsOnTheWire);
	}

	/** Granted authorities as plain role names, the way the frontend and the DTO speak of them. */
	private List<String> rolesOf(java.util.Collection<? extends GrantedAuthority> authorities) {
		return authorities.stream().map(GrantedAuthority::getAuthority)
				.map(a -> a.startsWith("ROLE_") ? a.substring("ROLE_".length()) : a).sorted().toList();
	}

	/**
	 * The same keys {@link #capabilitiesOf} produces, all false. Derived from it rather than written
	 * out, so a capability added there cannot be forgotten here and default to permitted.
	 */
	private Map<String, Boolean> noCapabilities() {
		Map<String, Boolean> capabilities = new LinkedHashMap<>(capabilitiesOf(List.of()));
		capabilities.replaceAll((capability, allowed) -> false);
		return capabilities;
	}

	/**
	 * What the UI may render, decided here so there is exactly one copy of the role table.
	 *
	 * <p>These are a rendering convenience and nothing more — every capability below is independently
	 * enforced by a {@code @PreAuthorize} on the endpoints it covers, and the frontend never checks a
	 * role name of its own. That is the whole point of shipping flags rather than roles: a screen is
	 * hidden by the same decision that would have refused it, so the two cannot drift into disagreeing
	 * about who may do what.
	 *
	 * <p>Each key names the endpoints it stands for, so a future annotation change has an obvious
	 * counterpart here:
	 * <ul>
	 *   <li>{@code manageUsers} — {@code /api/iam/**}</li>
	 *   <li>{@code manageConnections} — the writing half of {@code /api/connections/**}, plus
	 *       {@code run-seed} and {@code reveal-password}</li>
	 *   <li>{@code manageSystem} — {@code /api/system/fs/**}, {@code PUT /api/system/preferences},
	 *       {@code /api/system/update/apply}, the Chocolatey and test-email-server endpoints</li>
	 *   <li>{@code manageApps} — {@code /api/system/services/execute} and {@code /api/system/apps}:
	 *       starting the AI Hub and the sample-database starter packs is part of authoring, so an author
	 *       does not have to ask somebody else before they can begin</li>
	 *   <li>{@code editReports} / {@code authorScripts} — the writing half of {@code /api/reports/**},
	 *       and all of {@code /api/cubes}, {@code /api/explorations}, {@code /api/queries},
	 *       {@code /api/dsl}, {@code /api/analytics}</li>
	 *   <li>{@code viewConfiguration} — the read side of the same set; this is what shows or hides the
	 *       Configuration menu and the Samples modal's View Configuration button</li>
	 *   <li>{@code runJobs} — {@code /api/jobs/**}, {@code /api/system/fs/explorer/**},
	 *       {@code /api/system/gallery/**}</li>
	 * </ul>
	 */
	private Map<String, Boolean> capabilitiesOf(List<String> roles) {
		boolean admin = roles.contains(Role.ADMIN.name()) || roles.contains(Role.PLATFORM_ADMIN.name());
		boolean author = admin || roles.contains(Role.REPORT_AUTHOR.name());
		boolean operator = author || roles.contains(Role.JOB_OPERATOR.name());

		Map<String, Boolean> capabilities = new LinkedHashMap<>();
		capabilities.put("manageUsers", admin);
		capabilities.put("manageConnections", admin);
		capabilities.put("revealSecrets", admin);
		capabilities.put("manageSystem", admin);
		capabilities.put("manageApps", author);
		capabilities.put("authorScripts", author);
		capabilities.put("editReports", author);
		capabilities.put("viewConfiguration", author);
		capabilities.put("runJobs", operator);
		return capabilities;
	}
}
