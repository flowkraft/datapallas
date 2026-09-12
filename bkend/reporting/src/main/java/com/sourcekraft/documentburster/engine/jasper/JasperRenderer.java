package com.sourcekraft.documentburster.engine.jasper;

import java.io.File;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Renders a .jrxml template to a document.
 *
 * Two implementations exist because JasperReports 7 replaced the JRXML format:
 * {@link JasperReportRunner} embeds the JasperReports 7 library and handles
 * templates in the new format, while {@link JasperLegacyRestRenderer} hands
 * classic JRXML — the single format every version from 1.x to 6.21 produced —
 * to the JasperReports 6 container under tools/jasper-legacy.
 *
 * Everything around the render is shared: the same reporters, the same burst
 * pipeline, the same connection resolution, the same output formats. Only the
 * engine behind this interface differs.
 */
public interface JasperRenderer {

	/**
	 * Renders with no in-memory data. The template supplies its own rows, either
	 * from its embedded query against the given connection or from parameters.
	 */
	File generate(File reportDir, String jrxmlFileName, String format, File outputFile,
			String jdbcUrl, String jdbcUser, String jdbcPass, Map<String, String> params) throws Exception;

	/**
	 * Renders with rows from DataPallas's own data pipeline, which the template
	 * reads as fields. The connection is still passed so that a template carrying
	 * its own query — or a sub-report that does — keeps working.
	 */
	File generate(File reportDir, String jrxmlFileName, String format, File outputFile,
			List<LinkedHashMap<String, Object>> reportData, Map<String, String> params,
			String jdbcUrl, String jdbcUser, String jdbcPass) throws Exception;
}
