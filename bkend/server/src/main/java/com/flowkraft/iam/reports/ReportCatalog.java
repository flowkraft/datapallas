package com.flowkraft.iam.reports;

import java.util.List;

/**
 * The reports that exist, for granting and for reconciling.
 *
 * <p>An interface, and not {@code ReportsService} itself, for the same reason
 * {@code PublishedDashboardCatalog}, {@code DatabaseConnectionCatalog} and
 * {@code ReportConnectionCatalog} are ones: the IAM side depends on the single question it asks —
 * "which reports are there, and what are they called?" — rather than on the reporting layer, and the
 * group tests stay free of a {@code config/reports} folder on disk.
 *
 * <p>Every report, not only the published dashboards: a grant is about running and reading a report,
 * and a dashboard is simply one kind of report. The two catalogs therefore overlap on purpose, and
 * neither is derived from the other, because "is this a dashboard?" and "does this report exist?"
 * are different questions with different answers for the same id.
 */
public interface ReportCatalog {

	/**
	 * Every report, sorted by name — what the group dialog offers to tick, and what a grant is
	 * reconciled against on read.
	 */
	List<CatalogReport> reports();

	/**
	 * Does this report exist? Asked when a grant is written, so that a typo becomes a 400 in the
	 * dialog instead of a row nobody can explain later.
	 */
	default boolean exists(String reportId) {

		if (reportId == null || reportId.isBlank())
			return false;

		return reports().stream().anyMatch(report -> reportId.equals(report.id()));
	}

	/**
	 * @param id   the report id — the folder name under {@code config/reports}, {@code config/samples},
	 *             {@code config/reports-jasper} or {@code config/reports-jasper-legacy}
	 * @param name what the admin sees, the report's template name
	 */
	record CatalogReport(String id, String name) {
	}
}
