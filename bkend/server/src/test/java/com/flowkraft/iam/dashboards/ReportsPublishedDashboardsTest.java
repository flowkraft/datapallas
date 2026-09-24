package com.flowkraft.iam.dashboards;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

import com.flowkraft.iam.dashboards.PublishedDashboardCatalog.PublishedDashboard;
import com.flowkraft.reports.ReportsService;
import com.sourcekraft.documentburster.common.settings.model.ConfigurationFileInfo;

/**
 * Which of the installation's reports count as published dashboards.
 *
 * <p>The scan itself is {@code ReportsService}'s and is tested there; what is tested here is the one
 * decision this class makes — a report is a dashboard when its datasource type is
 * {@code ds.dashboard} — because everything else, granting and refusing alike, is built on that
 * answer.
 */
class ReportsPublishedDashboardsTest {

	@Test
	void onlyDashboardReportsAreListed() throws Exception {

		ReportsPublishedDashboards catalog = catalogOf(report("g-dashboard", "Monthly revenue", "ds.dashboard"),
				report("payroll", "Payroll", "ds.db"), report("g-pivottable", "Cash flow", "ds.dashboard"),
				report("mail-merge", "Welcome letter", "ds.excel"));

		assertEquals(List.of("g-pivottable", "g-dashboard"),
				catalog.publishedDashboards().stream().map(PublishedDashboard::id).toList());
	}

	@Test
	void theyAreSortedByNameIgnoringCase() throws Exception {

		ReportsPublishedDashboards catalog = catalogOf(report("c", "cash", "ds.dashboard"),
				report("a", "Attendance", "ds.dashboard"), report("b", "Budget", "ds.dashboard"));

		assertEquals(List.of("Attendance", "Budget", "cash"),
				catalog.publishedDashboards().stream().map(PublishedDashboard::name).toList());
	}

	@Test
	void aDashboardWithoutATemplateNameIsNamedAfterItsFolder() throws Exception {

		ReportsPublishedDashboards catalog = catalogOf(report("sales-pipeline", "  ", "ds.dashboard"));

		assertEquals("sales-pipeline", catalog.publishedDashboards().get(0).name());
	}

	@Test
	void aReportWithoutAFolderIsSkipped() throws Exception {

		// The fallback settings.xml has no folder of its own, so there is nothing a grant could name.
		ReportsPublishedDashboards catalog = catalogOf(report(null, "Fallback", "ds.dashboard"));

		assertTrue(catalog.publishedDashboards().isEmpty());
	}

	@Test
	void anUnreadableConfigFolderGrantsNothing() throws Exception {

		ReportsService reportsService = mock(ReportsService.class);
		when(reportsService.loadSettingsAllMinimal()).thenThrow(new RuntimeException("config/reports is gone"));

		// Fail closed: empty means nothing to tick, nothing in the viewer's list, and every check refuses.
		assertTrue(new ReportsPublishedDashboards(reportsService).publishedDashboards().isEmpty());
	}

	@Test
	void isPublishedDashboardAnswersTheSameQuestion() throws Exception {

		ReportsPublishedDashboards catalog = catalogOf(report("g-dashboard", "Monthly revenue", "ds.dashboard"),
				report("payroll", "Payroll", "ds.db"));

		assertTrue(catalog.isPublishedDashboard("g-dashboard"));
		assertFalse(catalog.isPublishedDashboard("payroll"));
		assertFalse(catalog.isPublishedDashboard("no-such-report"));
		assertFalse(catalog.isPublishedDashboard(null));
	}

	// ============================================================
	// helpers
	// ============================================================

	private ReportsPublishedDashboards catalogOf(ConfigurationFileInfo... reports) throws Exception {
		ReportsService reportsService = mock(ReportsService.class);
		when(reportsService.loadSettingsAllMinimal()).thenAnswer(invocation -> Stream.of(reports));
		return new ReportsPublishedDashboards(reportsService);
	}

	private ConfigurationFileInfo report(String folderName, String templateName, String dsInputType) {
		ConfigurationFileInfo report = new ConfigurationFileInfo();
		report.folderName = folderName;
		report.templateName = templateName;
		report.dsInputType = dsInputType;
		return report;
	}
}
