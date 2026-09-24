package com.flowkraft.iam.reports;

import java.util.Comparator;
import java.util.List;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.flowkraft.reports.ReportsService;

/**
 * The real catalog: every report the Reports screen scans, read through the same scan, so a group
 * can never grant a report the product does not show.
 */
@Component
public class ReportsAvailableReports implements ReportCatalog {

	private static final Logger log = LoggerFactory.getLogger(ReportsAvailableReports.class);

	private final ReportsService reportsService;

	@Autowired
	public ReportsAvailableReports(ReportsService reportsService) {
		this.reportsService = reportsService;
	}

	@Override
	public List<CatalogReport> reports() {
		try {
			return reportsService.loadSettingsAllMinimal().filter(report -> StringUtils.isNotBlank(report.folderName))
					.map(report -> new CatalogReport(report.folderName,
							StringUtils.defaultIfBlank(report.templateName, report.folderName)))
					.sorted(Comparator.comparing(CatalogReport::name, String.CASE_INSENSITIVE_ORDER)).toList();
		} catch (Exception e) {
			// An unreadable config folder must not turn into a grant nobody made. Empty means nothing
			// to tick in the group dialog and no id that validates — the same fail-closed answer
			// ReportsPublishedDashboards gives. It cannot widen anybody's access, because what a person
			// may see is read from the grant rows, never from this list.
			log.warn("Could not read the reports catalog: {}", e.getMessage());
			return List.of();
		}
	}
}
