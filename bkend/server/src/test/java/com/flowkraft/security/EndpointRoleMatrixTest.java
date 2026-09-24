package com.flowkraft.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.io.InputStream;
import java.lang.reflect.AccessibleObject;
import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import org.aopalliance.intercept.MethodInvocation;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.parameters.P;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.method.PreAuthorizeAuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.iam.AuthController;
import com.flowkraft.iam.Role;

/**
 * Who may open each of this server's doors, derived from the code and compared with a decision
 * written down — and then, for each of the four roles, the positive half: the doors that role is
 * meant to be able to open really do open for it.
 *
 * <p><b>Why this test exists at all.</b> Everything else in this area proves that the wrong person
 * is refused. Almost nothing proved that the right person is admitted, and a role accidentally
 * locked out of an endpoint it needs produces no failing test — it produces a support ticket in the
 * middle of somebody's work. The other half of the gap is quieter still: no test in this repository
 * exercised {@code @PreAuthorize} at all. Every server test builds its controller with
 * {@code ReflectionTestUtils} and calls the method directly, which bypasses method security
 * completely, so "a JOB_OPERATOR may call this" was an assertion nobody made in either direction.
 *
 * <p><b>The matrix is derived, never written by hand.</b> {@link #derive()} reflects over every
 * {@code @RestController}, resolves each mapping's effective {@code @PreAuthorize} (method
 * overrides class) and produces {@code METHOD path -> role}. That is compared against
 * {@code src/test/resources/endpoint-role-matrix.txt}, which is the decision record. So a new
 * endpoint added without deciding its role fails the build, and an annotation lost in a refactor
 * fails loudly here instead of silently widening a door. Endpoints that are deliberately open are
 * in that file too, marked and with their reason, rather than quietly skipped.
 *
 * <p><b>How "admitted" is proved.</b> Through
 * {@link PreAuthorizeAuthorizationManager} — the very component Spring's method-security
 * interceptor delegates to at runtime — asked about the real {@link Method} and therefore the real
 * annotation, with an {@link Authentication} built the way {@code IamUserDetailsService} builds one
 * (own role plus every weaker). This is a deliberate choice over a {@code @WebMvcTest} slice per
 * controller: it is the same decision, made by the same class, over every door at once, without
 * twenty-six contexts full of mocked services standing between the test and the annotation it is
 * about. What it does not cover — the handful of paths
 * {@code SecurityConfig} opens before method security is reached — is covered instead by
 * {@link #everyPublicPathIsOneWeChoseToOpen()}, because those endpoints carry no annotation for an
 * authorization manager to read.
 */
class EndpointRoleMatrixTest {

	private static final String BASE_PACKAGE = "com.flowkraft";

	private static final String EXPECTED_RESOURCE = "/endpoint-role-matrix.txt";

	/** No annotation: the door is decided by SecurityConfig, or by a data check inside the handler. */
	private static final String NO_ANNOTATION = "(none)";

	private static List<Endpoint> endpoints;

	@BeforeAll
	static void deriveOnce() {
		endpoints = derive();
	}

	// ============================================================
	// 1. the matrix
	// ============================================================

	@Test
	void theRolesTheCodeGrantsAreTheRolesThatWereDecided() throws Exception {

		List<String> derived = endpoints.stream().map(Endpoint::line).sorted().toList();
		List<String> expected = readExpected();

		Set<String> onlyInCode = new TreeSet<>(derived);
		onlyInCode.removeAll(expected);
		Set<String> onlyInTheDecision = new TreeSet<>(expected);
		onlyInTheDecision.removeAll(derived);

		assertTrue(onlyInCode.isEmpty() && onlyInTheDecision.isEmpty(),
				"The endpoint/role matrix moved. Decide what should be true, then update\n"
						+ "src/test/resources/endpoint-role-matrix.txt - line by line, reading each one.\n\n"
						+ "In the code but not in the decision (a new door, or one whose role changed):\n  "
						+ String.join("\n  ", onlyInCode) + "\n\n"
						+ "In the decision but not in the code (a door removed, renamed, or an annotation lost):\n  "
						+ String.join("\n  ", onlyInTheDecision));
	}

	@Test
	void everyEndpointCarriesARoleOrIsOneWeChoseToLeaveOpen() throws Exception {

		// The point of the file is that "(none)" is a decision somebody made and can be asked about,
		// not the default that happens when nobody thought about it. Every unannotated endpoint is
		// therefore listed with the reason it is unannotated, in the comment above its line.
		List<String> unannotated = endpoints.stream().filter(e -> NO_ANNOTATION.equals(e.role()))
				.map(Endpoint::line).sorted().toList();

		for (String line : unannotated)
			assertTrue(reasonFor(line) != null,
					line + " carries no @PreAuthorize and no reason in endpoint-role-matrix.txt."
							+ " Give it a role, or write down above its line why it is open.");
	}

	@Test
	void everyPublicPathIsOneWeChoseToOpen() throws Exception {

		// SecurityConfig is the only other place a door is opened, and it opens paths rather than
		// methods, so no authorization manager can be asked about them.
		//
		// The first version of this test listed six known-public paths and asserted they were still
		// there. That reads like a guard and is not one: it notices a public path being REMOVED, and
		// stays green while somebody adds "/api/system/**" to permitAll - the direction that actually
		// costs something. It now pins the whole list instead, in both directions: these matcher
		// groups end in permitAll, spelled as SecurityConfig spells them, and no others do.
		String config = Files.readString(Path.of(
				"src/main/java/com/flowkraft/security/SecurityConfig.java"), StandardCharsets.UTF_8);

		List<String> decided = List.of(
				// The whole server, and only when security is switched off: the desktop's own chain,
				// where there is no account to be anybody.
				"anyRequest",
				// Sign-in, the identity probe, and first-run bootstrap - nobody could be authenticated
				// yet when these are called.
				"\"/api/auth/login\", \"/api/auth/me\", \"/api/auth/first-run\", \"/api/auth/bootstrap-admin\", \"/api/auth/providers\"",
				// Leaving for the identity provider and coming back: pre-authentication by definition.
				"FederatedLoginConfig.OIDC_LOGIN_PATH, FederatedLoginConfig.OIDC_CALLBACK_PATH",
				// Licensing answers everybody. Deliberate, and argued at length above this line in
				// SecurityConfig: read that comment before touching this one.
				"\"/api/system/license/**\"",
				// Static bundles loaded by third-party pages that cannot carry a session. The DATA they
				// then fetch is still authorized.
				"\"/rb-webcomponents/**\", \"/geojson/**\"",
				"\"/\", \"/index.html\", \"/favicon.ico\", \"/assets/**\", \"/lib/frend/**\"",
				"SecurityConfig::isStaticAsset");

		assertEquals(decided, matchersEndingIn(config, ".permitAll()"),
				"The list of paths this server opens to everybody has changed. That is a decision, so\n"
						+ "make it here as well as in SecurityConfig: add or remove the group in this test,\n"
						+ "with the reason, and say in the pull request what is now reachable without a\n"
						+ "credential. An extra group here means an extra door.");

		// Not permitAll and not authenticated either: four paths opened by a short-lived embed token
		// for one report. Pinned for the same reason - widening this list widens the product.
		assertEquals(List.of(
				"\"/api/reports/*/config\", \"/api/reports/*/data\", \"/dashboard/*\", \"/api/analytics/pivot\""),
				matchersEndingIn(config, ".access("),
				"The token-authorised paths changed. Four of them were decided, each because a web"
						+ " component on somebody else's page needs it; a fifth needs the same argument made.");

		assertTrue(config.contains(".anyRequest().authenticated())"),
				"The real chain no longer ends in anyRequest().authenticated(), so an endpoint nobody"
						+ " listed is no longer refused by default - which is the rule everything else here"
						+ " is written on top of");
	}

	/**
	 * The matcher groups ending in {@code terminal}, in source order, each spelled as SecurityConfig
	 * spells it with its whitespace collapsed; {@code anyRequest} for the chain that matches
	 * everything. Reading the configuration as text is crude, and the honest alternative - standing up
	 * a context and interrogating the filter chain - costs seconds per run and a mock for every bean
	 * it touches. Crude and impossible to pass by accident beats subtle and green whatever happens.
	 */
	private static List<String> matchersEndingIn(String config, String terminal) {

		String opener = ".requestMatchers(";
		List<String> groups = new ArrayList<>();

		for (int at = config.indexOf(terminal); at >= 0; at = config.indexOf(terminal, at + 1)) {

			int matchers = config.lastIndexOf(opener, at);
			if (config.lastIndexOf(".anyRequest()", at) > matchers) {
				groups.add("anyRequest");
				continue;
			}
			if (matchers < 0)
				continue;

			int open = matchers + opener.length();
			int depth = 1;
			int i = open;
			while (i < config.length() && depth > 0) {
				char c = config.charAt(i++);
				if (c == '(')
					depth++;
				else if (c == ')')
					depth--;
			}
			assertEquals(0, depth, "SecurityConfig has an unbalanced requestMatchers( near character "
					+ matchers + ", so this test cannot say what is open and will not pretend to");
			groups.add(config.substring(open, i - 1).replaceAll("\\s+", " ").trim());
		}
		return groups;
	}

	// ============================================================
	// 2. the positive half — the door really opens
	// ============================================================

	/**
	 * The role each door must open for is read from the decision record, not from the annotation this
	 * test is about. Asking the annotation and then asserting the annotation admits whoever the
	 * annotation names is a test that compares the code with itself: narrow a door from JOB_OPERATOR
	 * to ADMIN and both sides move together, so nothing goes red except the matrix. Read the promise
	 * from the file instead and a narrowed door fails here too — as somebody locked out of their own
	 * screen, which is the failure this test exists for.
	 */
	@Test
	void everyRoleIsAdmittedToEveryDoorTheDecisionOpensForThem() throws Exception {

		PreAuthorizeAuthorizationManager manager = new PreAuthorizeAuthorizationManager();
		Map<String, Role> decided = decidedRoles();
		List<String> wronglyRefused = new ArrayList<>();

		for (Endpoint endpoint : endpoints) {
			Role required = decided.get(endpoint.httpMethod() + " " + endpoint.path());
			if (required == null)
				continue;

			for (Role who : signInRoles())
				if (who.includes(required) && !admits(manager, endpoint, who))
					wronglyRefused.add(who + " is refused " + endpoint.line());
		}

		assertTrue(wronglyRefused.isEmpty(),
				"These doors refuse somebody the matrix says may open them — which is the failure that"
						+ " produces a support ticket rather than a test failure:\n  "
						+ String.join("\n  ", wronglyRefused));
	}

	@Test
	void theNextWeakerRoleIsRefused() throws Exception {

		PreAuthorizeAuthorizationManager manager = new PreAuthorizeAuthorizationManager();
		Map<String, Role> decided = decidedRoles();
		List<String> wronglyAdmitted = new ArrayList<>();

		for (Endpoint endpoint : endpoints) {
			Role required = decided.get(endpoint.httpMethod() + " " + endpoint.path());
			if (required == null)
				continue;

			for (Role who : signInRoles())
				if (!who.includes(required) && admits(manager, endpoint, who))
					wronglyAdmitted.add(who + " opens " + endpoint.line());
		}

		assertTrue(wronglyAdmitted.isEmpty(),
				"These doors open for somebody weaker than the matrix says:\n  "
						+ String.join("\n  ", wronglyAdmitted));
	}

	@Test
	void theOneConditionalDoorOpensOnItsCondition() {

		// AnalyticsController's /pivot is the single endpoint whose expression is not a plain role:
		// a REPORT_AUTHOR always, and anybody else only when a reportId is present, because a pivot
		// over a saved report is a dashboard being read and a pivot over nothing is authoring.
		Endpoint pivot = endpoints.stream()
				.filter(e -> e.expression() != null && e.expression().contains("#reportId"))
				.findFirst().orElseThrow(() -> new AssertionError(
						"the conditional /pivot door is gone — if that was deliberate, delete this test"));

		PreAuthorizeAuthorizationManager manager = new PreAuthorizeAuthorizationManager();

		assertTrue(admits(manager, pivot, Role.REPORT_AUTHOR, withReportId(pivot, null)),
				"an author authors a pivot over nothing at all");
		assertFalse(admits(manager, pivot, Role.DASHBOARD_VIEWER, withReportId(pivot, null)),
				"a viewer without a report is authoring, and authoring is not theirs");
		assertTrue(admits(manager, pivot, Role.DASHBOARD_VIEWER, withReportId(pivot, "some-report")),
				"a viewer with a report is reading a dashboard, which is exactly theirs");
		assertFalse(admits(manager, pivot, Role.DASHBOARD_VIEWER, withReportId(pivot, "   ")),
				"a blank reportId is not a report, and the expression says so with isBlank()");
	}

	// ============================================================
	// 3. the capability table promises what the doors deliver
	// ============================================================

	@Test
	void whatTheCapabilityTablePromisesEachRoleTheDoorsAdmitThemTo() {

		// The frontend draws its screens from these flags. A flag that says yes over a tier of doors
		// that refuses the role is a screen that fails when it is used; a flag that says no over a
		// tier that admits them is a door nobody knows is open. Both are drift, and neither shows up
		// in a test that only reads annotations.
		Map<String, Role> tierOf = new LinkedHashMap<>();
		tierOf.put("manageUsers", Role.ADMIN);
		tierOf.put("manageConnections", Role.ADMIN);
		tierOf.put("revealSecrets", Role.ADMIN);
		tierOf.put("manageSystem", Role.ADMIN);
		tierOf.put("manageApps", Role.REPORT_AUTHOR);
		tierOf.put("authorScripts", Role.REPORT_AUTHOR);
		tierOf.put("editReports", Role.REPORT_AUTHOR);
		tierOf.put("viewConfiguration", Role.REPORT_AUTHOR);
		tierOf.put("runJobs", Role.JOB_OPERATOR);

		AuthController authController = new AuthController();

		for (Role who : signInRoles()) {
			Map<String, Boolean> capabilities = capabilitiesOf(authController, who);

			assertEquals(tierOf.keySet(), capabilities.keySet().stream()
					.filter(tierOf::containsKey).collect(Collectors.toCollection(LinkedHashSet::new)),
					"a capability was added or renamed: decide which tier of doors backs it, or say here"
							+ " that it backs none (as dashboardsOnly does)");

			for (Map.Entry<String, Role> entry : tierOf.entrySet()) {
				boolean promised = Boolean.TRUE.equals(capabilities.get(entry.getKey()));
				boolean admitted = who.includes(entry.getValue());

				assertEquals(admitted, promised,
						who + ": the capability table says " + entry.getKey() + "=" + promised
								+ ", but the doors at the " + entry.getValue() + " tier "
								+ (admitted ? "admit" : "refuse") + " them");
			}
		}

		// dashboardsOnly backs no tier of its own on purpose: it says "this person has their
		// dashboards and nothing else", which is the absence of the other flags rather than a door.
		assertTrue(Boolean.TRUE.equals(
				capabilitiesOf(authController, Role.DASHBOARD_VIEWER).get("dashboardsOnly")));
		assertFalse(Boolean.TRUE.equals(
				capabilitiesOf(authController, Role.JOB_OPERATOR).get("dashboardsOnly")));
	}

	// ============================================================
	// deriving the matrix
	// ============================================================

	private record Endpoint(String httpMethod, String path, String role, String expression,
			Method method) {

		String line() {
			return httpMethod + " " + path + " -> " + role;
		}

		Role requiredRole() {
			if (NO_ANNOTATION.equals(role))
				return null;
			try {
				return Role.valueOf(role);
			} catch (IllegalArgumentException conditional) {
				return null;
			}
		}
	}

	private static List<Endpoint> derive() {

		ClassPathScanningCandidateComponentProvider scanner =
				new ClassPathScanningCandidateComponentProvider(false);
		scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));

		List<Endpoint> found = new ArrayList<>();

		for (BeanDefinition definition : scanner.findCandidateComponents(BASE_PACKAGE)) {
			Class<?> controller;
			try {
				controller = Class.forName(definition.getBeanClassName());
			} catch (ClassNotFoundException e) {
				throw new IllegalStateException(e);
			}

			RequestMapping onClass = AnnotatedElementUtils.findMergedAnnotation(controller, RequestMapping.class);
			String prefix = onClass == null || onClass.path().length == 0 ? "" : onClass.path()[0];
			PreAuthorize classRule = AnnotatedElementUtils.findMergedAnnotation(controller, PreAuthorize.class);

			for (Method method : controller.getDeclaredMethods()) {
				RequestMapping mapping = AnnotatedElementUtils.findMergedAnnotation(method, RequestMapping.class);
				if (mapping == null)
					continue;

				PreAuthorize rule = AnnotatedElementUtils.findMergedAnnotation(method, PreAuthorize.class);
				if (rule == null)
					rule = classRule;

				String expression = rule == null ? null : rule.value();
				String role = roleOf(expression, method);

				for (String path : mapping.path().length == 0 ? new String[] { "" } : mapping.path())
					for (String verb : mapping.method().length == 0 ? new String[] { "ANY" }
							: java.util.Arrays.stream(mapping.method()).map(Enum::name).toArray(String[]::new))
						found.add(new Endpoint(verb, normalise(prefix + path), role, expression, method));
			}
		}

		found.sort(Comparator.comparing(Endpoint::line));
		return found;
	}

	/**
	 * The weakest role an expression admits, as a name for the matrix. Deliberately strict: an
	 * expression shape nobody has seen before fails the test rather than being guessed at, because a
	 * guess here would write a wrong decision into the file and then defend it.
	 */
	private static String roleOf(String expression, Method method) {

		if (expression == null)
			return NO_ANNOTATION;

		for (Role role : Role.values())
			if (expression.equals("hasRole('" + role.name() + "')"))
				return role.name();

		if (expression.startsWith("hasRole('REPORT_AUTHOR') or "))
			return "REPORT_AUTHOR (or the condition)";

		return fail("unrecognised @PreAuthorize on " + method + ": " + expression
				+ " — teach this test what it means before shipping it");
	}

	private static String normalise(String path) {
		String normalised = path.startsWith("/") ? path : "/" + path;
		return normalised.length() > 1 && normalised.endsWith("/")
				? normalised.substring(0, normalised.length() - 1) : normalised;
	}

	// ============================================================
	// asking the real authorization manager
	// ============================================================

	/**
	 * The arguments to hand the authorization manager for the conditional door, with {@code reportId}
	 * in the slot it really occupies. SpEL resolves {@code #reportId} by parameter position, so a
	 * one-element array against a three-parameter method leaves it null and "proves" a refusal the
	 * running server never makes — the parameter is found by its {@code @P} name, and if it ever
	 * stops being there this fails instead of quietly passing nothing.
	 */
	private static Object[] withReportId(Endpoint endpoint, String reportId) {

		Parameter[] parameters = endpoint.method().getParameters();
		Object[] arguments = new Object[parameters.length];
		boolean placed = false;

		for (int i = 0; i < parameters.length; i++) {
			P named = parameters[i].getAnnotation(P.class);
			if ((named != null && "reportId".equals(named.value())) || "reportId".equals(parameters[i].getName())) {
				arguments[i] = reportId;
				placed = true;
			}
		}

		assertTrue(placed, endpoint.line() + " no longer has a reportId parameter this test can bind,"
				+ " so what it asserts about #reportId would mean nothing");
		return arguments;
	}

	private static boolean admits(PreAuthorizeAuthorizationManager manager, Endpoint endpoint, Role who,
			Object... arguments) {

		Object[] args = arguments.length > 0 ? arguments
				: new Object[endpoint.method().getParameterCount()];

		Supplier<Authentication> authentication = () -> authenticationFor(who);
		AuthorizationDecision decision = manager.check(authentication, invocationOf(endpoint.method(), args));
		return decision != null && decision.isGranted();
	}

	/** Own role plus every weaker one — the authorities {@code IamUserDetailsService} really grants. */
	private static Authentication authenticationFor(Role held) {
		List<GrantedAuthority> authorities = new ArrayList<>();
		for (Role weaker : Role.values())
			if (weaker != Role.PLATFORM_ADMIN && held.includes(weaker))
				authorities.add(new SimpleGrantedAuthority(weaker.authority()));
		return new UsernamePasswordAuthenticationToken("someone", null, authorities);
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Boolean> capabilitiesOf(AuthController controller, Role who) {
		// Package-private on purpose over there: it is the server's own answer, not an API. Reached
		// here rather than widened there, so this test costs the product nothing.
		return (Map<String, Boolean>) ReflectionTestUtils.invokeMethod(controller, "capabilitiesOf",
				heldBy(who));
	}

	private static List<String> heldBy(Role role) {
		List<String> roles = new ArrayList<>();
		for (Role weaker : Role.values())
			if (weaker != Role.PLATFORM_ADMIN && role.includes(weaker))
				roles.add(weaker.name());
		return roles;
	}

	/** The four roles somebody actually signs in as; PLATFORM_ADMIN is not one of them. */
	private static List<Role> signInRoles() {
		return List.of(Role.ADMIN, Role.REPORT_AUTHOR, Role.JOB_OPERATOR, Role.DASHBOARD_VIEWER);
	}

	/**
	 * The authorization manager refuses an invocation with no target at all, so every invocation here
	 * carries this one. It is deliberately a bare object rather than an instance or a mock of the
	 * controller: the manager asks the target's class for the most specific version of the method,
	 * and a subclass that does not declare the method — which is every class except the controller —
	 * leaves the real one in place, parameter annotations and all. A Mockito mock does declare it,
	 * as a generated override that has lost the {@code @P} names the expressions are written in, and
	 * {@code #reportId} then silently resolves to nothing. Nothing is ever called on this object: the
	 * invocation exists to be authorised, never to proceed.
	 */
	private static final Object NEVER_INVOKED = new Object();

	private static MethodInvocation invocationOf(Method method, Object[] arguments) {
		return new MethodInvocation() {

			@Override
			public Method getMethod() {
				return method;
			}

			@Override
			public Object[] getArguments() {
				return arguments;
			}

			@Override
			public Object getThis() {
				return NEVER_INVOKED;
			}

			@Override
			public AccessibleObject getStaticPart() {
				return method;
			}

			@Override
			public Object proceed() {
				throw new UnsupportedOperationException(
						"this invocation exists to be authorised, never to be run");
			}
		};
	}

	// ============================================================
	// the decision record
	// ============================================================

	/**
	 * {@code METHOD path -> Role} for every door the decision record gives a plain role to. Doors
	 * recorded as {@code (none)} or as a condition are left out: they are decided by SecurityConfig
	 * or inside the handler, and {@link #theOneConditionalDoorOpensOnItsCondition()} and
	 * {@link #everyPublicPathIsOneWeChoseToOpen()} are where those are asserted instead.
	 */
	private static Map<String, Role> decidedRoles() throws Exception {

		Map<String, Role> decided = new LinkedHashMap<>();

		for (String line : readExpected()) {
			int arrow = line.lastIndexOf(" -> ");
			if (arrow < 0)
				continue;
			try {
				decided.put(line.substring(0, arrow), Role.valueOf(line.substring(arrow + 4).trim()));
			} catch (IllegalArgumentException openOrConditional) {
				// "(none)" and "REPORT_AUTHOR (or the condition)": not a plain role, asserted elsewhere.
			}
		}
		return decided;
	}

	private static List<String> readExpected() throws Exception {
		return expectedLines().stream().filter(line -> !line.isBlank() && !line.startsWith("#"))
				.sorted().toList();
	}

	/** The comment block directly above a line — the reason an open door is open. */
	private static String reasonFor(String line) throws Exception {
		List<String> lines = expectedLines();
		int at = lines.indexOf(line);
		if (at <= 0)
			return null;
		String above = lines.get(at - 1).trim();
		return above.startsWith("#") ? above : null;
	}

	private static List<String> expectedLines() throws Exception {
		try (InputStream in = EndpointRoleMatrixTest.class.getResourceAsStream(EXPECTED_RESOURCE)) {
			if (in == null)
				throw new AssertionError("src/test/resources" + EXPECTED_RESOURCE + " is missing");
			return List.of(new String(in.readAllBytes(), StandardCharsets.UTF_8).split("\n"));
		}
	}
}
