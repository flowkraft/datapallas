package com.flowkraft.iam.limits;

import java.util.List;
import java.util.Locale;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.flowkraft.reports.ReportsService;
import com.sourcekraft.documentburster.common.settings.model.ConnectionFileInfo;

/**
 * The real catalog of file-based databases: the {@code db-*} connections under
 * {@code config/connections} whose server type keeps its data in a file, read through the same call
 * the Connections screen uses — so the guard and the screen can never disagree about which file
 * belongs to which connection.
 */
@Component
public class ReportsDatabaseFiles implements DatabaseFileCatalog {

	private static final Logger log = LoggerFactory.getLogger(ReportsDatabaseFiles.class);

	/** The server types whose "database" is a path on disk rather than a name on a server. */
	private static final List<String> FILE_BASED = List.of("sqlite", "duckdb");

	private final ReportsService reportsService;

	@Autowired
	public ReportsDatabaseFiles(ReportsService reportsService) {
		this.reportsService = reportsService;
	}

	@Override
	public List<DatabaseFile> databaseFiles() {
		try {
			return reportsService.loadSettingsConnectionDatabaseAll().filter(ReportsDatabaseFiles::isFileBased)
					.map(info -> new DatabaseFile(info.connectionCode, info.dbserver.database)).toList();
		} catch (Exception e) {
			// An unreadable connections folder must not open the folder up. The guard treats a file
			// it cannot match to an allowed connection as refused, so an empty catalog refuses every
			// database file to a limited author rather than serving one by accident.
			log.warn("Could not read the database connections, database files cannot be matched: {}", e.getMessage());
			return List.of();
		}
	}

	private static boolean isFileBased(ConnectionFileInfo info) {

		if (info == null || info.dbserver == null || StringUtils.isBlank(info.dbserver.database)
				|| StringUtils.isBlank(info.connectionCode))
			return false;

		// The type is what the Connections screen wrote; the extension is a second look at the same
		// question, so a connection whose type is spelled some other way is still matched by its file.
		return FILE_BASED.contains(StringUtils.defaultString(info.dbserver.type).toLowerCase(Locale.ROOT))
				|| FsLimitsGuard.isDatabaseFile(info.dbserver.database);
	}
}
