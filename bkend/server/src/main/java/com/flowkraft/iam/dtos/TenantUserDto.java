package com.flowkraft.iam.dtos;

import java.util.List;

import com.flowkraft.iam.limits.LimitSettings;

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
		String createdAt,
		List<GroupRefDto> groups,
		LimitSettings effectiveLimits,
		List<String> effectiveReports,
		String opensOn) {

	/** A user with nothing filled in about groups — what the store alone can say. */
	public TenantUserDto(long id, String username, String email, String status, boolean platformAdmin, String role,
			String createdAt) {
		this(id, username, email, status, platformAdmin, role, createdAt, List.of(), null, null, null);
	}

	/**
	 * The same user, with the groups they are in and the limits that actually apply.
	 *
	 * <p>Filled in by the endpoint rather than by the store, because groups and the combining rule
	 * belong to {@code LimitsService} — and because the admin screen is the only caller that needs
	 * them.
	 *
	 * @param effectiveLimits  {@code null} means unlimited
	 * @param effectiveReports the reports this person's groups name, or {@code null} when they name
	 *                         none — which means every report, not no report. The Edit User dialog
	 *                         shows the two differently for that reason
	 * @param opensOn         the dashboard a viewer lands on, resolved the same way the AI Hub resolves
	 *                        it, so the Edit User dialog shows what will actually happen. {@code null}
	 *                        for every other role, and for a viewer who has been granted nothing
	 */
	public TenantUserDto withGroups(List<GroupRefDto> groups, LimitSettings effectiveLimits,
			List<String> effectiveReports, String opensOn) {
		return new TenantUserDto(id, username, email, status, platformAdmin, role, createdAt, groups, effectiveLimits,
				effectiveReports, opensOn);
	}
}
