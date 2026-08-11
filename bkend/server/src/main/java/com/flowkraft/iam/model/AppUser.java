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
 */
public record AppUser(
		long id,
		String username,
		String email,
		String passwordHash,
		String status,
		boolean platformAdmin,
		String createdAt) {

	public static final String DEFAULT_USERNAME = "admin";

	public static final String STATUS_ACTIVE = "ACTIVE";
	public static final String STATUS_DISABLED = "DISABLED";

	public boolean isActive() {
		return STATUS_ACTIVE.equals(status);
	}

	/** Same user without the hash, for anything that leaves the server. */
	public AppUser withoutSecret() {
		return new AppUser(id, username, email, null, status, platformAdmin, createdAt);
	}
}
