package com.flowkraft.iam.limits;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.flowkraft.reports.ReportsService;
import com.sourcekraft.documentburster.common.settings.model.ReportSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;
import com.sourcekraft.documentburster.utils.Utils;

/**
 * The real catalog: a report's own {@code reporting.xml}, read through the same loader the Reports
 * screen saves with, so what the check sees is exactly what the engine would open.
 *
 * <h2>The two fields</h2>
 * {@code datasource.sqloptions.conncode} and {@code datasource.scriptoptions.conncode} — the only two
 * places a report names a database connection. A CSV, Excel, XML or fixed-width datasource names
 * none and therefore limits nobody, which is the intended answer and not an oversight.
 *
 * <h2>Declared, not actual</h2>
 * A Groovy datasource script can open a connection of its own at run time, and nothing here would see
 * it. That is the same trust boundary the {@code scripts} limit already draws: a group that allows
 * scripts has decided to trust that author with server code (TODO 23, decision 3).
 *
 * <h2>JasperReports</h2>
 * A standalone {@code .jrxml} names its connection in {@code datasource.properties} rather than in
 * {@code reporting.xml}, resolved through the per-report file, the folder-wide file and then the
 * default connection. Rather than re-implement that order, those reports are looked up in the same
 * scan the Reports screen lists — the one place it is already implemented.
 */
@Component
public class ReportsDeclaredConnections implements ReportConnectionCatalog {

	private static final Logger log = LoggerFactory.getLogger(ReportsDeclaredConnections.class);

	private final ReportsService reportsService;

	@Autowired
	public ReportsDeclaredConnections(ReportsService reportsService) {
		this.reportsService = reportsService;
	}

	@Override
	public Optional<List<String>> connectionsOfSettingsFile(String settingsFilePath) {

		if (StringUtils.isBlank(settingsFilePath))
			return Optional.empty();

		String path = absolute(settingsFilePath);
		if (!new File(path).isFile())
			return Optional.empty();

		try {
			ReportingSettings reporting = reportsService.loadSettingsReporting(path);
			List<String> declared = declaredIn(reporting);

			if (declared.isEmpty() && isJasper(path))
				return Optional.of(jasperConnectionsOf(folderNameOf(path)));

			return Optional.of(declared);
		} catch (Exception e) {
			// Unreadable is not "declares nothing": the caller refuses a limited caller rather than
			// letting a report nobody can read through the one check that would have stopped it.
			log.warn("Could not read the connections declared by {}: {}", settingsFilePath, e.getMessage());
			return Optional.empty();
		}
	}

	@Override
	public Optional<List<String>> connectionsOfReport(String reportId) {

		if (StringUtils.isBlank(reportId))
			return Optional.empty();

		String path = settingsPathOf(reportId);
		return path == null ? Optional.empty() : connectionsOfSettingsFile(path);
	}

	// ============================================================
	// reading the report
	// ============================================================

	private List<String> declaredIn(ReportingSettings reporting) {

		List<String> codes = new ArrayList<>();
		if (reporting == null || reporting.report == null || reporting.report.datasource == null)
			return codes;

		ReportSettings.DataSource datasource = reporting.report.datasource;
		if (datasource.sqloptions != null)
			add(codes, datasource.sqloptions.conncode);
		if (datasource.scriptoptions != null)
			add(codes, datasource.scriptoptions.conncode);

		return new ArrayList<>(new LinkedHashSet<>(codes));
	}

	private void add(List<String> codes, String connectionCode) {
		if (StringUtils.isNotBlank(connectionCode))
			codes.add(connectionCode.trim());
	}

	private List<String> jasperConnectionsOf(String folderName) {
		try {
			return reportsService.loadSettingsAllMinimal()
					.filter(report -> folderName.equals(report.folderName))
					.map(report -> report.dbConnectionCode)
					.filter(StringUtils::isNotBlank)
					.distinct()
					.toList();
		} catch (Exception e) {
			log.warn("Could not read the connection of the JasperReports template {}: {}", folderName, e.getMessage());
			return List.of();
		}
	}

	// ============================================================
	// paths
	// ============================================================

	/**
	 * The same search order {@code JobsController.resolveSettingsPath} and
	 * {@code ReportsController.resolveSettingsPath} use, so a report id resolves to the file that
	 * would actually run and not to a different one.
	 */
	private String settingsPathOf(String reportId) {

		for (String candidate : List.of("config/reports/" + reportId + "/settings.xml",
				"config/samples/" + reportId + "/settings.xml",
				"config/samples/_frend/" + reportId + "/settings.xml",
				"config/reports-jasper/" + reportId + "/settings.xml",
				"config/reports-jasper-legacy/" + reportId + "/settings.xml")) {

			String path = Utils.resolvePathAgainstPortableDir(candidate);
			if (new File(path).isFile())
				return path;
		}

		if ("burst".equals(reportId)) {
			String burst = Utils.resolvePathAgainstPortableDir("config/burst/settings.xml");
			if (new File(burst).isFile())
				return burst;
		}

		return null;
	}

	private String absolute(String settingsFilePath) {
		File file = new File(settingsFilePath);
		return file.isAbsolute() ? settingsFilePath
				: Utils.resolvePathAgainstPortableDir(settingsFilePath.replaceFirst("^\\./", "").replaceFirst("^/", ""));
	}

	private boolean isJasper(String path) {
		String unix = path.replace("\\", "/");
		return unix.contains("/config/reports-jasper/") || unix.contains("/config/reports-jasper-legacy/");
	}

	private String folderNameOf(String path) {
		File parent = new File(path.replace("\\", "/")).getParentFile();
		return parent == null ? StringUtils.EMPTY : parent.getName();
	}
}
