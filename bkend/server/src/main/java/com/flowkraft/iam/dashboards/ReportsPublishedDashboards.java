package com.flowkraft.iam.dashboards;

import java.util.Comparator;
import java.util.List;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.flowkraft.reports.ReportsService;

/**
 * The real catalog: the reports under {@code config/reports} and {@code config/samples} whose
 * datasource type is {@code ds.dashboard}, read through the same scan the Reports screen uses, so a
 * group can never grant a dashboard the product does not show.
 */
@Component
public class ReportsPublishedDashboards implements PublishedDashboardCatalog {

	private static final String DASHBOARD_DATASOURCE_TYPE = "ds.dashboard";

	private static final Logger log = LoggerFactory.getLogger(ReportsPublishedDashboards.class);

	private final ReportsService reportsService;

	@Autowired
	public ReportsPublishedDashboards(ReportsService reportsService) {
		this.reportsService = reportsService;
	}

	@Override
	public List<PublishedDashboard> publishedDashboards() {
		try {
			return reportsService.loadSettingsAllMinimal()
					.filter(report -> DASHBOARD_DATASOURCE_TYPE.equals(report.dsInputType))
					.filter(report -> StringUtils.isNotBlank(report.folderName))
					.map(report -> new PublishedDashboard(report.folderName,
							StringUtils.defaultIfBlank(report.templateName, report.folderName)))
					.sorted(Comparator.comparing(PublishedDashboard::name, String.CASE_INSENSITIVE_ORDER))
					.toList();
		} catch (Exception e) {
			// An unreadable config folder must not hand a viewer dashboards nobody granted them. Empty
			// is the fail-closed answer everywhere this is used: nothing to tick in the group dialog,
			// nothing in the viewer's list, and every access check refuses.
			log.warn("Could not read the published dashboards: {}", e.getMessage());
			return List.of();
		}
	}
}
