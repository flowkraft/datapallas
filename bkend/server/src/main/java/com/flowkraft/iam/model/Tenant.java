package com.flowkraft.iam.model;

/**
 * One department (self-hosted) or one customer workspace (SaaS). In {@code STANDALONE} there is
 * exactly one, coded {@code default}, and the user never sees it.
 *
 * @param homeDir     the tenant's PORTABLE_EXECUTABLE_DIR. In STANDALONE this is the installation
 *                    directory itself; from Phase 3 each tenant gets its own.
 * @param customerRef the billing customer this tenant belongs to — a plain string carried from the
 *                    license (self-hosted) or set by the control plane (SaaS). Deliberately NOT a
 *                    foreign key to a Customer entity: DataPallas does not model billing.
 */
public record Tenant(
		long id,
		String code,
		String displayName,
		String homeDir,
		String customerRef,
		String status,
		String createdAt) {

	public static final String DEFAULT_CODE = "default";

	public static final String STATUS_ACTIVE = "ACTIVE";
	public static final String STATUS_SUSPENDED = "SUSPENDED";

	public boolean isActive() {
		return STATUS_ACTIVE.equals(status);
	}
}
