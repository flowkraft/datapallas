package com.flowkraft.iam.dashboards;

import java.util.List;

/**
 * The dashboards that exist, for granting and for checking.
 *
 * <p>An interface, and not {@code ReportsService} itself, for the same reason
 * {@code DatabaseConnectionCatalog} is one: the IAM side depends on the single question it asks —
 * "which published dashboards are there, and what are they called?" — rather than on the reporting
 * layer, and the group tests stay free of a {@code config/reports} folder on disk.
 */
public interface PublishedDashboardCatalog {

	/**
	 * Every published dashboard, sorted by name. A published dashboard is a report whose
	 * {@code reporting.xml} datasource type is {@code ds.dashboard} — what publishing a canvas writes,
	 * and what the shipped {@code g-dashboard} and {@code g-pivottable} samples are.
	 */
	List<PublishedDashboard> publishedDashboards();

	/**
	 * Is this report a published dashboard? The one question the grants, the viewer's list and the
	 * access check all ask, so that a report id which is not a dashboard cannot become a grant through
	 * one path and be refused through another.
	 */
	default boolean isPublishedDashboard(String reportId) {

		if (reportId == null || reportId.isBlank())
			return false;

		return publishedDashboards().stream().anyMatch(dashboard -> reportId.equals(dashboard.id()));
	}

	/**
	 * @param id   the report id — the folder name under {@code config/reports} or {@code config/samples}
	 * @param name what the admin and the viewer see, the report's template name
	 */
	record PublishedDashboard(String id, String name) {
	}
}
