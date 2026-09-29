package com.flowkraft.embed;

import java.time.Clock;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.Preferences;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;
import com.sourcekraft.documentburster.common.reportparameters.BuiltinVariables;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Who is asking, in the form a widget's SQL can compare against: the {@code ${dp_…}} variables.
 *
 * <p>An access filter, or any widget's WHERE clause, says {@code owner = ${dp_user_id}} and means
 * "the person making this request". This class is the one place that decides what that is. Every
 * value here is read from the session or the credential and put into the request's parameters
 * <em>after</em> the query string has been read, so no viewer can name themselves somebody else by
 * typing {@code ?dp_user_id=boss}: their value is simply overwritten. That is the whole security
 * property, and it is why these variables live here next to {@link LockedParams} rather than being
 * parameters a dashboard declares.
 *
 * <p>A viewer the host application vouches for but this installation has no account for is
 * described by the attribute bag instead: {@code ${dp_attr_customer_id}} is what the embed token or
 * the share link carries for them ({@link CallerAttributes}), and nothing else can set it.
 *
 * <p>The values are always defined, for every kind of caller. A share link has no person behind it,
 * so its four person variables are empty strings; a condition comparing with an empty value matches
 * no row, which is the safe answer, and never an error. What each kind of caller gets is the table
 * "Callers without a person" in the plan, answered by the owner on 2026-09-27.
 *
 * <h2>Never the internal id</h2>
 * {@code ${dp_user_id}} is {@code app_user.username} and {@code ${dp_tenant_id}} is
 * {@code tenant.code} — never the auto-increment numbers. Those numbers are handed out separately by
 * every installation, so no customer's warehouse and no demo row could ever name one, and an access
 * filter written against one would be unportable. {@code UserVariablesTest} goes red if either
 * variable ever carries the number.
 */
@Component
public class UserVariables {

	/**
	 * Reserved. Nothing a user declares — parameter, cube parameter or lock — may start with it.
	 *
	 * <p>The prefix itself is {@link BuiltinVariables#PREFIX}, in {@code bkend/common}, because the
	 * query plumbing down there has to recognise a built-in name too and cannot see this class.
	 */
	public static final String PREFIX = BuiltinVariables.PREFIX;

	public static final String USER_ID = PREFIX + "user_id";
	public static final String USER_EMAIL = PREFIX + "user_email";
	public static final String USER_GROUPS = PREFIX + "user_groups";
	public static final String USER_ROLE = PREFIX + "user_role";
	public static final String TENANT_ID = PREFIX + "tenant_id";
	public static final String USER_TIMEZONE = PREFIX + "user_timezone";
	public static final String USER_LOCALE = PREFIX + "user_locale";
	public static final String TODAY = PREFIX + "today";
	public static final String NOW = PREFIX + "now";

	/** The two that are not text: a widget compares them with a date and a timestamp column. */
	public static final Set<String> DATE_NAMES = Set.of(TODAY);
	public static final Set<String> TIMESTAMP_NAMES = Set.of(NOW);

	/**
	 * The variables this server fills by name, which is not the same question as
	 * {@link #isBuiltinName}: that one asks whether a name is reserved, and everything beginning
	 * with {@code dp_} is, on purpose. This one asks whether there is anything behind it - what a
	 * cube file's author needs to hear before a condition of theirs is bound to nothing, matches
	 * no row and shows an empty widget.
	 *
	 * <p>{@code dp_attr_<name>} is not in the set and is known all the same: what the embedding
	 * application may say about a viewer is its own list, not this one's.
	 */
	public static final Set<String> FIXED_NAMES = Set.of(USER_ID, USER_EMAIL, USER_GROUPS, USER_ROLE,
			TENANT_ID, USER_TIMEZONE, USER_LOCALE, TODAY, NOW);

	/** True when the server has a value of that name to fill in, attributes included. */
	public static boolean isKnownBuiltin(String name) {
		String written = name == null ? "" : name.trim().toLowerCase(java.util.Locale.ROOT);
		return FIXED_NAMES.contains(written) || written.startsWith(CallerAttributes.PREFIX);
	}

	private final IamRepository repository;

	/**
	 * Settable so a test can fix "now" and watch two people in two zones get two different dates.
	 * Nothing else replaces it; in the running server it is the system clock.
	 */
	private Clock clock = Clock.systemUTC();

	@Autowired
	public UserVariables(IamRepository repository) {
		this.repository = repository;
	}

	public void setClock(Clock clock) {
		this.clock = clock == null ? Clock.systemUTC() : clock;
	}

	/**
	 * @return true when this name belongs to the reserved namespace — whether or not it is one of the
	 *         names above, because {@code dp_attr_<name>} is open-ended and a future variable must not
	 *         become nameable by a dashboard in the meantime.
	 */
	public static boolean isBuiltinName(String name) {
		return BuiltinVariables.isBuiltinName(name);
	}

	/** @return true when any of these names is reserved — what a "refused on save" check asks. */
	public static Optional<String> firstBuiltinName(Iterable<String> names) {

		if (names == null)
			return Optional.empty();

		for (String name : names)
			if (isBuiltinName(name))
				return Optional.of(name);

		return Optional.empty();
	}

	/**
	 * The variables for whoever made this request, never null and never partial.
	 *
	 * <p>Callers merge this into their parameter map <em>last</em>, after the locks — see the
	 * precedence table in the plan: row 0 is not replaceable from the request.
	 */
	public Map<String, String> of(HttpServletRequest request) {

		Caller caller = callerOf(request);

		ZoneId zone = zoneOf(caller);
		ZonedDateTime now = ZonedDateTime.now(clock.withZone(zone));

		Map<String, String> values = new LinkedHashMap<>();

		values.put(USER_ID, caller.user() == null ? "" : StringUtils.defaultString(caller.user().username()));
		values.put(USER_EMAIL, caller.user() == null ? "" : StringUtils.defaultString(caller.user().email()));
		values.put(USER_GROUPS, String.join(",", caller.groupSlugs()));
		values.put(USER_ROLE, caller.role() == null ? "" : slugOf(caller.role()));
		values.put(TENANT_ID, caller.tenant() == null ? "" : StringUtils.defaultString(caller.tenant().code()));
		values.put(USER_TIMEZONE, zone.getId());
		values.put(USER_LOCALE, localeOf(caller));

		// A DATE and a TIMESTAMP, in ISO form, because that is what ParameterTypes.typed parses and
		// what every vendor's driver then binds as the real type. Seconds, not nanoseconds: a bound
		// value with more precision than the column has is a comparison that never matches.
		values.put(TODAY, now.toLocalDate().toString());
		values.put(NOW, now.toLocalDateTime().truncatedTo(ChronoUnit.SECONDS).toString());

		// What the embedding application said this viewer is. Only the ones the credential carries
		// are put here: an attribute a widget names and the token does not have is simply not in the
		// map, and the query plumbing binds a missing builtin as empty - which matches no row. That
		// is the whole point of the bag; the alternative is a filter that quietly stops filtering.
		caller.attributes().forEach((name, value) -> values.put(CallerAttributes.PREFIX + name,
				StringUtils.defaultString(value)));

		return values;
	}

	/** {@code DASHBOARD_VIEWER} → {@code dashboard-viewer} (owner, question 4). */
	public static String slugOf(Role role) {
		return role == null ? "" : role.name().toLowerCase(Locale.ROOT).replace('_', '-');
	}

	// ============================================================
	// who is asking
	// ============================================================

	/**
	 * What the request says about its caller, resolved once.
	 *
	 * @param user  null for every caller with no person behind it
	 * @param role  null likewise
	 */
	private record Caller(AppUser user, Tenant tenant, Role role, List<String> groupSlugs,
			Map<String, String> attributes, String tokenZone, String tokenLocale) {

		/** A caller a session identified: attributes belong to a credential, and there is none here. */
		Caller(AppUser user, Tenant tenant, Role role, List<String> groupSlugs) {
			this(user, tenant, role, groupSlugs, Map.of(), null, null);
		}
	}

	private Caller callerOf(HttpServletRequest request) {

		// A share link or an embed token. The credential is the permission; there is no person behind
		// it, so the four person variables are empty (owner, question 3) and a widget that filters by
		// person shows such a viewer nothing unless it says otherwise — with ${dp_attr_…}, say.
		// The tenant is the default one: neither credential carries a tenant of its own today, and an
		// installation the share token's tenant_id could point elsewhere in is Phase 3's work.
		if (TokenRequest.isTokenRequest(request))
			return new Caller(null, defaultTenant(), null, List.of(), CallerAttributes.of(request),
					CallerAttributes.zoneOf(request), CallerAttributes.localeOf(request));

		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

		if (authentication == null || !authentication.isAuthenticated()
				|| "anonymousUser".equals(authentication.getPrincipal()))
			return new Caller(null, defaultTenant(), null, List.of());

		// The desktop. The installation key is the Electron shell asking on behalf of whoever owns the
		// machine, and on the desktop that person is the administrator (owner, question 3).
		if (LimitsService.API_KEY_PRINCIPAL.equals(authentication.getName()))
			return new Caller(repository.findUserByUsername(AppUser.DEFAULT_USERNAME).orElse(null), defaultTenant(),
					Role.ADMIN, List.of());

		Optional<AppUser> user = repository.findUserByUsername(authentication.getName());

		// Authenticated, but not a person this store knows: another machine caller. Nothing to say
		// about a person, so nothing is said — rather than guessing at one.
		if (user.isEmpty())
			return new Caller(null, defaultTenant(), null, List.of());

		return personCaller(user.get());
	}

	private Caller personCaller(AppUser user) {

		// The same choice /me makes, so what a widget filters by and what the header shows are the one
		// tenant. A person in several is in the first of them until Phase 3 lets them switch.
		Tenant tenant = repository.findMembershipsByTenantCode(user.id()).keySet().stream().findFirst()
				.flatMap(repository::findTenantByCode).orElseGet(this::defaultTenant);

		Role role = tenant == null ? null : repository.findRole(user.id(), tenant.id()).orElse(null);
		if (role == null && user.platformAdmin())
			role = Role.PLATFORM_ADMIN;

		// Only the groups of the tenant this request is in: a group of another tenant says nothing
		// about what may be read here, and letting its slug into the list would be a way across.
		final Tenant inTenant = tenant;
		List<String> slugs = repository.findGroupsOfUser(user.id()).stream()
				.filter(group -> inTenant != null && group.tenantId() == inTenant.id())
				.map(UserGroup::slug)
				.filter(StringUtils::isNotBlank)
				.toList();

		return new Caller(user, tenant, role, slugs);
	}

	private Tenant defaultTenant() {
		return repository.findTenantByCode(Tenant.DEFAULT_CODE).orElse(null);
	}

	// ============================================================
	// zone and locale
	// ============================================================

	/**
	 * The person's own zone, else their tenant's, else the server's. A stored value that has stopped
	 * being a zone — a zone the JDK dropped, a row edited by hand — falls through to the next one
	 * rather than failing the request: a dashboard that cannot be opened is worse than one whose
	 * "today" is the server's.
	 */
	private ZoneId zoneOf(Caller caller) {

		ZoneId fromUser = caller.user() == null ? null : Preferences.zoneOrNull(caller.user().timezone());
		if (fromUser != null)
			return fromUser;

		// A token viewer has no profile, so the host application answers for them - it is the only
		// thing that knows where its own customer is. Never the browser's headers: a value read from
		// the request is a value the viewer chooses, and ${dp_today} decides which rows they see.
		ZoneId fromToken = Preferences.zoneOrNull(caller.tokenZone());
		if (fromToken != null)
			return fromToken;

		ZoneId fromTenant = caller.tenant() == null ? null : Preferences.zoneOrNull(caller.tenant().timezone());
		if (fromTenant != null)
			return fromTenant;

		return clock.getZone();
	}

	private String localeOf(Caller caller) {

		String fromUser = caller.user() == null ? null : caller.user().locale();
		if (Preferences.isValidLocale(fromUser))
			return fromUser.trim();

		if (Preferences.isValidLocale(caller.tokenLocale()))
			return caller.tokenLocale().trim();

		String fromTenant = caller.tenant() == null ? null : caller.tenant().locale();
		if (Preferences.isValidLocale(fromTenant))
			return fromTenant.trim();

		return Locale.getDefault().toLanguageTag();
	}

}
