package com.flowkraft.iam.limits;

import java.util.List;
import java.util.Optional;

/**
 * Which database connections a report declares.
 *
 * <p>An interface, and not {@code ReportsService} itself, for the same reason
 * {@link DatabaseConnectionCatalog} and {@code PublishedDashboardCatalog} are ones: the IAM side
 * depends on the single question it asks — "what would running this report reach?" — rather than on
 * the reporting layer, and the tests stay free of a {@code config/reports} folder on disk.
 *
 * <h2>Keyed on the settings file, not on a report id</h2>
 * The report id is the convenient form and the listing side uses it, but it is not the form dispatch
 * always has: {@code POST /api/jobs} accepts a {@code burst} with no {@code reportId} at all (the
 * engine then runs {@code config/burst/settings.xml}), and {@code POST /api/jobs/resume} names a
 * {@code .progress} file whose {@code configurationFilePath} is the only thing that says which report
 * is about to run. Keyed on the id alone, both of those would walk past the check.
 *
 * <h2>"I do not know" is not "nothing"</h2>
 * Both methods answer {@link Optional#empty()} when the question could not be answered — an
 * unreadable report, a settings file that is not there any more. That is deliberately different from
 * a present-but-empty list, which means "this report declares no database connection" and is how a
 * CSV, Excel, XML or fixed-width report stays runnable by everybody. The caller turns the first into
 * a refusal for a limited caller and leaves everybody else alone.
 */
public interface ReportConnectionCatalog {

	/**
	 * @param settingsFilePath the report's {@code settings.xml}, as dispatch resolved it
	 * @return the connection codes that running this report would open, empty when it opens none,
	 *         {@link Optional#empty()} when the file could not be read
	 */
	Optional<List<String>> connectionsOfSettingsFile(String settingsFilePath);

	/**
	 * The same question by report id — the folder name under {@code config/reports},
	 * {@code config/samples}, {@code config/reports-jasper} or {@code config/reports-jasper-legacy}.
	 */
	Optional<List<String>> connectionsOfReport(String reportId);
}
