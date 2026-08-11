package com.flowkraft.iam.dtos;

import jakarta.validation.constraints.NotBlank;

/**
 * Body of {@code POST /api/iam/users}.
 *
 * @param role       one of ADMIN / REPORT_AUTHOR / JOB_OPERATOR / REPORT_VIEWER. PLATFORM_ADMIN is rejected —
 *                   it is not a tenant role and must never be grantable through this endpoint.
 * @param tenantCode optional; defaults to the caller's own tenant, which is all that single-tenant
 *                   deployments ever need.
 */
public record CreateUserRequestDto(
		@NotBlank String username,
		String email,
		@NotBlank String password,
		@NotBlank String role,
		String tenantCode) {
}
