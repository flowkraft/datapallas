package com.flowkraft.iam.reports;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.iam.reports.ReportCatalog.CatalogReport;

/**
 * The list an admin grants reports from.
 *
 * <p>Its own endpoint, and not a filter on {@code GET /api/reports}, because that list is already
 * narrowed to what its caller may run — which is precisely what an administrator must <em>not</em>
 * be shown here. Granting is done from every report there is, or a group could only ever be given
 * what its administrator happens to be able to run themselves.
 *
 * <p>{@code ADMIN} only, like {@code GroupsController} and the dashboards catalog beside it: a
 * REPORT_AUTHOR who could grant reports could widen their own access, which is the self-service
 * privilege this design exists to prevent (the owner's decision 8).
 */
@RestController
public class ReportGrantsController {

	@Autowired
	private ReportGrants grants;

	/** What the group dialog offers to tick. */
	@GetMapping(value = "/api/iam/reports", produces = MediaType.APPLICATION_JSON_VALUE)
	@PreAuthorize("hasRole('ADMIN')")
	public List<CatalogReport> availableReports() {
		return grants.available();
	}
}
