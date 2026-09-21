package com.flowkraft.iam.dtos;

import java.util.List;
import java.util.Map;

/**
 * What {@code GET /api/auth/me} returns — the frontend's single source of truth for what to render.
 *
 * <p>Two fields decide the shell. {@code authenticated} decides whether the application renders at
 * all or the login door does — it is answered the same way in every deployment, because every
 * deployment authenticates. {@code machine} says WHO is authenticated: a person with an account, or a
 * credential belonging to the installation itself (the API key the desktop signs its own requests
 * with, or an embedding app). A machine has no account to show, rename or sign out of, so the user
 * menu is rendered for people only.
 *
 * <p>There is deliberately no deployment mode here. The UI used to be told which shape it was
 * running in and decided from that — a declaration the product had no way to check, and the one that
 * let a desktop shell sit on a server's store and call itself single-user. Everything the shell needs
 * is in the answer to "who is calling": whether they are authenticated, whether they are a person,
 * and which capabilities they hold.
 *
 * @param capabilities coarse yes/no flags derived from the caller's roles, so the UI can disable a
 *                     button without hard-coding the role table twice. The backend still enforces
 *                     every one of them — these are for rendering, never for security.
 */
public record IdentityDto(
		boolean authenticated,
		boolean machine,
		UserDto user,
		TenantDto tenant,
		List<String> roles,
		Map<String, Boolean> capabilities,
		Map<String, String> memberships) {

	public record UserDto(String username, String email, boolean platformAdmin) {
	}

	public record TenantDto(String code, String displayName) {
	}
}
