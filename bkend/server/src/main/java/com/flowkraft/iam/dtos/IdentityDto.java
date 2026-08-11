package com.flowkraft.iam.dtos;

import java.util.List;
import java.util.Map;

/**
 * What {@code GET /api/auth/me} returns — the frontend's single source of truth for what to render.
 *
 * <p>{@code mode} is the important field. When it is {@code "standalone"} the Angular shell must hide
 * every trace of authentication: no login screen, no user menu, no logout, no Users/Roles/Tenants
 * screens. The desktop and the server run the same bundle and differ only by this value.
 *
 * @param capabilities coarse yes/no flags derived from the caller's roles, so the UI can disable a
 *                     button without hard-coding the role table twice. The backend still enforces
 *                     every one of them — these are for rendering, never for security.
 */
public record IdentityDto(
		String mode,
		boolean authenticated,
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
