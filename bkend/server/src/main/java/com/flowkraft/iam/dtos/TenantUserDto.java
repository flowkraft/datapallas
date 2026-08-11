package com.flowkraft.iam.dtos;

/**
 * A user as seen from inside one tenant — identity plus the role they hold there.
 *
 * <p>Separate from {@code AppUser} because a role only exists in the context of a tenant: the same
 * person can be a ADMIN in Finance and a REPORT_VIEWER in HR. Returning the pair together also keeps
 * the admin screen to one request instead of one per row.
 *
 * <p>Carries no password hash, by construction rather than by remembering to strip one.
 */
public record TenantUserDto(
		long id,
		String username,
		String email,
		String status,
		boolean platformAdmin,
		String role,
		String createdAt) {
}
