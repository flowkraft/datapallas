package com.flowkraft.iam.dtos;

import java.util.List;

import com.flowkraft.iam.limits.LimitSettings;

/**
 * A group as the Groups screen needs it: what it is called, what it limits, and who is in it.
 *
 * <p>The members come along with the group rather than from a second request per row, because the
 * screen shows the count on every line and the names in the dialog.
 *
 * @param reports          the report ids this group grants its members, as stored. Empty is not
 *                         "nothing": a member no group of whose names a single report may see every
 *                         report, which is what keeps an upgraded installation working. See
 *                         {@code ReportGrants}.
 * @param dashboards       the report ids this group grants its dashboard viewers, as stored. One that
 *                         no longer exists is still listed, so the dialog can show it as "(missing)"
 *                         and the admin can untick it — hiding it would leave a row nobody can remove.
 * @param defaultDashboard the one its viewers land on, or null
 */
public record GroupDto(
		long id,
		String name,
		LimitSettings settings,
		List<String> members,
		List<String> reports,
		List<String> dashboards,
		String defaultDashboard) {
}
