package com.flowkraft.iam.model;

/**
 * A person who operates DataPallas — someone who builds reports, authors dashboards or runs jobs.
 *
 * <p>Not to be confused with the people who <em>receive</em> the documents DataPallas produces. Those
 * live in the portal apps and have their own, separate identity design; DataPallas never models a
 * tenant's end customers.
 *
 * @param passwordHash BCrypt. Never encrypt a password — {@code SecretsCipher} is for secrets that
 *                     have to be read back, which a password never does.
 * @param platformAdmin manages tenants and users across the whole installation. In SaaS this is ours,
 *                      never the customer's.
 * @param timezone      an IANA zone ({@code Europe/Lisbon}), or {@code null} when this person never
 *                      said and the tenant, then the server, answers for them. It is what
 *                      {@code ${dp_today}} and {@code ${dp_now}} are computed in: a dashboard
 *                      filtered on "today" means the reader's today, not the server's.
 * @param locale        a BCP 47 tag ({@code pt-BR}), or {@code null} for the same reason.
 */
public record AppUser(
		long id,
		String username,
		String email,
		String passwordHash,
		String status,
		boolean platformAdmin,
		String createdAt,
		String timezone,
		String locale) {

	public static final String DEFAULT_USERNAME = "admin";

	public static final String STATUS_ACTIVE = "ACTIVE";
	public static final String STATUS_DISABLED = "DISABLED";

	public boolean isActive() {
		return STATUS_ACTIVE.equals(status);
	}

	/** Same user without the hash, for anything that leaves the server. */
	public AppUser withoutSecret() {
		return new AppUser(id, username, email, null, status, platformAdmin, createdAt, timezone, locale);
	}
}
