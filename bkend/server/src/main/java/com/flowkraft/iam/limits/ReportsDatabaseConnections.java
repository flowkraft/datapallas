package com.flowkraft.iam.limits;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.flowkraft.reports.ReportsService;
import com.sourcekraft.documentburster.common.settings.model.ConnectionFileInfo;

/**
 * The real catalog: the {@code db-*} connections under {@code config/connections}, read through the
 * same call the Connections screen uses, so a group can never be limited to a connection the product
 * does not show.
 */
@Component
public class ReportsDatabaseConnections implements DatabaseConnectionCatalog {

	private static final Logger log = LoggerFactory.getLogger(ReportsDatabaseConnections.class);

	private final ReportsService reportsService;

	@Autowired
	public ReportsDatabaseConnections(ReportsService reportsService) {
		this.reportsService = reportsService;
	}

	@Override
	public List<String> databaseConnectionIds() {
		try {
			return reportsService.loadSettingsConnectionDatabaseAll().map(info -> info.connectionCode)
					.filter(code -> code != null && !code.isBlank()).toList();
		} catch (Exception e) {
			// An unreadable connections folder must not make every group unsaveable. The caller treats
			// an empty catalog as "cannot check", and enforcement stays fail-closed regardless: a
			// connection that is not in a group's list is refused whether or not it exists.
			log.warn("Could not read the database connections, group limits cannot be checked: {}", e.getMessage());
			return List.of();
		}
	}
}
