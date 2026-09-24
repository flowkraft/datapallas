package com.flowkraft.iam.dashboards;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.dashboards.PublishedDashboardCatalog.PublishedDashboard;
import com.flowkraft.iam.model.UserGroup;

/**
 * Which dashboards a group grants, and therefore which ones a dashboard viewer may open.
 *
 * <h2>The rule</h2>
 * A viewer sees the distinct union of the dashboards granted to all of their groups, sorted by name.
 * In no granting group they see none — a newly published dashboard is visible to nobody until an
 * admin ticks it. Groups only ever add access here too, exactly as they do for author limits.
 *
 * <h2>Deleted dashboards</h2>
 * Grants are report ids in a database and reports are folders on disk, so the two can disagree. They
 * are reconciled on every read against {@link PublishedDashboardCatalog}: a grant naming a report
 * that no longer exists, or one that is no longer a dashboard, is ignored rather than trusted. The
 * group dialog is the one place that still shows it, as "(missing)", so an admin can untick it.
 *
 * <h2>No cache</h2>
 * Read on every call, like the limits are, so a dashboard an admin has just unticked stops opening
 * at once rather than at the next restart.
 */
@Service
public class DashboardGrants {

	private final IamRepository repository;

	private final PublishedDashboardCatalog catalog;

	@Autowired
	public DashboardGrants(IamRepository repository, PublishedDashboardCatalog catalog) {
		this.repository = repository;
		this.catalog = catalog;
	}

	// ============================================================
	// the catalog
	// ============================================================

	/** Every published dashboard, sorted by name — what the group dialog offers to tick. */
	public List<PublishedDashboard> published() {
		return catalog.publishedDashboards();
	}

	public boolean isPublishedDashboard(String reportId) {
		return catalog.isPublishedDashboard(reportId);
	}

	// ============================================================
	// what a group grants
	// ============================================================

	/** The report ids this group grants, as stored — including any that no longer exist. */
	public List<String> dashboardsOfGroup(long groupId) {
		return repository.findGroupDashboards(groupId);
	}

	/**
	 * Replace a group's dashboards and its default. Both are checked first, so a bad request leaves
	 * the group exactly as it was.
	 */
	public void setGroupDashboards(long groupId, List<String> reportIds, String defaultDashboard) {
		List<String> granted = validated(reportIds);
		repository.setGroupDashboards(groupId, granted, validatedDefault(granted, defaultDashboard));
	}

	/**
	 * @return the distinct ids, in the order given
	 * @throws IllegalArgumentException naming the first id that is not a published dashboard — a 400,
	 *                                  because granting a report that is not a dashboard, or one that
	 *                                  does not exist, is a typo and never something the dialog sends
	 */
	public List<String> validated(List<String> reportIds) {

		if (reportIds == null)
			return List.of();

		List<String> distinct = new ArrayList<>(new LinkedHashSet<>(reportIds));
		for (String reportId : distinct)
			if (!catalog.isPublishedDashboard(reportId))
				throw new IllegalArgumentException("No such published dashboard: " + reportId);

		return distinct;
	}

	/**
	 * @return the default, or null when the group has no opinion
	 * @throws IllegalArgumentException when the default is not one of the dashboards the same save
	 *                                  grants — a group whose default it does not grant is a group
	 *                                  whose viewers land on a 403
	 */
	public String validatedDefault(List<String> granted, String defaultDashboard) {

		String clean = StringUtils.trimToNull(defaultDashboard);
		if (clean == null)
			return null;

		if (granted == null || !granted.contains(clean))
			throw new IllegalArgumentException(
					"The default dashboard '" + clean + "' is not one of the dashboards this group grants");

		return clean;
	}

	// ============================================================
	// what a person sees
	// ============================================================

	/** The report ids granted to this user by any of their groups, deleted ones included. */
	public List<String> grantedIdsOf(long userId) {
		return repository.findDashboardsOfUser(userId);
	}

	/**
	 * The dashboards this user may open: the union of their groups' grants that still exist, by name.
	 *
	 * <p>This is the viewer's rule. Every other role is handed the whole catalog instead — see
	 * {@link #dashboardsFor(long, boolean)} — because dashboard grants exist to give a viewer
	 * something, never to take anything away from anybody else.
	 */
	public List<PublishedDashboard> dashboardsOf(long userId) {

		List<String> granted = repository.findDashboardsOfUser(userId);
		if (granted.isEmpty())
			return List.of();

		return catalog.publishedDashboards().stream().filter(dashboard -> granted.contains(dashboard.id())).toList();
	}

	/** {@link #dashboardsOf} for a viewer, the whole catalog for anybody else. */
	public List<PublishedDashboard> dashboardsFor(long userId, boolean dashboardsOnly) {
		return dashboardsOnly ? dashboardsOf(userId) : catalog.publishedDashboards();
	}

	/**
	 * What a viewer lands on: the default of their first group, by group name, that has one and still
	 * grants it; otherwise the first dashboard of their list, by name; otherwise null, which the page
	 * renders as its empty state.
	 */
	public String defaultDashboardOf(long userId) {

		List<PublishedDashboard> visible = dashboardsOf(userId);
		if (visible.isEmpty())
			return null;

		Map<String, PublishedDashboard> byId = visible.stream()
				.collect(Collectors.toMap(PublishedDashboard::id, Function.identity(), (first, second) -> first));

		// findGroupsOfUser orders by group name, so the first group with a usable default wins.
		for (UserGroup group : repository.findGroupsOfUser(userId)) {
			String candidate = StringUtils.trimToNull(group.defaultDashboard());
			if (candidate != null && byId.containsKey(candidate))
				return candidate;
		}

		return visible.get(0).id();
	}
}
