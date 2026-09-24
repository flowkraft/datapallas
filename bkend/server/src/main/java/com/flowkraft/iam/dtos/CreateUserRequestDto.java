package com.flowkraft.iam.dtos;

import java.util.List;

import jakarta.validation.constraints.NotBlank;

/**
 * Body of {@code POST /api/iam/users}.
 *
 * @param role       one of ADMIN / REPORT_AUTHOR / JOB_OPERATOR / REPORT_VIEWER. PLATFORM_ADMIN is rejected —
 *                   it is not a tenant role and must never be grantable through this endpoint.
 * @param tenantCode optional; defaults to the caller's own tenant, which is all that single-tenant
 *                   deployments ever need.
 * @param groupIds   optional; the groups to put the new user in. Validated before the user is
 *                   created, so a bad id leaves nothing behind. Missing or empty behaves exactly as
 *                   it did before groups existed.
 */
public record CreateUserRequestDto(
		@NotBlank String username,
		String email,
		@NotBlank String password,
		@NotBlank String role,
		String tenantCode,
		List<Long> groupIds) {
}
