package com.flowkraft.iam.model;

/**
 * A named set of people, and what an admin has decided about them.
 *
 * <p>Roles say what kind of work someone does; groups say which things they can reach. A person can be
 * in any number of groups, including none, and a group that sets no limits is simply a way of
 * organising people.
 *
 * @param settingsJson     the raw {@code settings_json} column. Kept as text here so the store layer
 *                         stays free of Jackson; {@code LimitSettings.parse} turns it into the shape,
 *                         and the one place that decides what an unknown key means stays the one place.
 * @param defaultDashboard the report id a dashboard viewer in this group lands on, or {@code null} when
 *                         the group has no opinion. The dashboards themselves are rows of their own
 *                         ({@code user_group_dashboard}), because a group grants any number of them.
 */
public record UserGroup(
		long id,
		long tenantId,
		String name,
		String settingsJson,
		String defaultDashboard,
		String createdAt) {
}
