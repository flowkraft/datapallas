package com.sourcekraft.documentburster.engine.jasper;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import net.sf.jasperreports.engine.DefaultJasperReportsContext;
import net.sf.jasperreports.engine.JREmptyDataSource;
import net.sf.jasperreports.engine.data.JRMapCollectionDataSource;
import net.sf.jasperreports.engine.JRParameter;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.SimpleJasperReportsContext;
import net.sf.jasperreports.repo.RepositoryService;
import net.sf.jasperreports.engine.export.HtmlExporter;
import net.sf.jasperreports.engine.export.JRCsvExporter;
import net.sf.jasperreports.engine.export.ooxml.JRXlsxExporter;
import net.sf.jasperreports.export.SimpleExporterInput;
import net.sf.jasperreports.export.SimpleHtmlExporterOutput;
import net.sf.jasperreports.export.SimpleOutputStreamExporterOutput;
import net.sf.jasperreports.export.SimpleWriterExporterOutput;
import net.sf.jasperreports.pdf.JRPdfExporter;

/**
 * Renders JasperReports 7 templates with the embedded JasperReports library.
 * Classic JRXML (1.x - 6.21) is a different format and goes through
 * {@link JasperLegacyRestRenderer} instead.
 */
public class JasperReportRunner implements JasperRenderer {

	private static final Logger log = LoggerFactory.getLogger(JasperReportRunner.class);

	/**
	 * The engine's own context, carrying one extra repository so that a sub-report
	 * which exists only as .jrxml still renders. It inherits from the default
	 * context, so every extension found on the classpath — fonts, charts, barcodes
	 * — is still in play.
	 *
	 * Static because the repository caches what it compiles, and a wrapper report
	 * builds a new runner for every row it renders.
	 */
	private static final SimpleJasperReportsContext CONTEXT = createContext();

	private static SimpleJasperReportsContext createContext() {
		SimpleJasperReportsContext context = new SimpleJasperReportsContext(
				DefaultJasperReportsContext.getInstance());
		context.setExtensions(RepositoryService.class,
				Collections.singletonList(new CompilingReportRepository()));
		return context;
	}

	@Override
	public File generate(File reportDir, String jrxmlFileName, String format, File outputFile,
			String jdbcUrl, String jdbcUser, String jdbcPass, Map<String, String> params) throws Exception {

		File jrxmlFile = new File(reportDir, jrxmlFileName);
		if (!jrxmlFile.exists()) {
			throw new IllegalArgumentException("Template not found: " + jrxmlFile.getAbsolutePath());
		}

		// 1. Compile .jrxml -> JasperReport
		log.info("Compiling {} ...", jrxmlFile.getName());
		JasperReport report = JasperCompileManager.getInstance(CONTEXT).compile(jrxmlFile.getAbsolutePath());

		// 2. Build parameters map
		Map<String, Object> jasperParams = new HashMap<>();
		jasperParams.put("SUBREPORT_DIR", reportDir.getAbsolutePath() + File.separator);

		if (params != null && !params.isEmpty()) {
			coerceAndPutParams(report, jasperParams, params);
		}

		// 3. Fill report
		JasperPrint print;
		Connection conn = null;
		try {
			if (jdbcUrl != null && !jdbcUrl.isEmpty()) {
				log.info("Connecting to database ...");
				conn = DriverManager.getConnection(jdbcUrl, jdbcUser, jdbcPass != null ? jdbcPass : "");
				print = JasperFillManager.getInstance(CONTEXT).fill(report, jasperParams, conn);
			} else {
				print = JasperFillManager.getInstance(CONTEXT).fill(report, jasperParams, new JREmptyDataSource());
			}
			log.info("Report filled: {} page(s)", print.getPages().size());

			// 4. Ensure output directory exists
			if (outputFile.getParentFile() != null) {
				outputFile.getParentFile().mkdirs();
			}

			// 5. Export
			log.info("Exporting to {} ...", format.toUpperCase());
			export(print, format, outputFile);

			log.info("Output written to: {}", outputFile.getAbsolutePath());
			return outputFile;
		} finally {
			if (conn != null) {
				try {
					conn.close();
				} catch (Exception ignored) {
				}
			}
		}
	}

	/**
	 * Overload that accepts in-memory report data (from ReportBurster's data pipeline)
	 * plus an optional JDBC connection. Used when .jrxml is written inline as an output template.
	 * The report data feeds the main dataset, while the connection is passed as REPORT_CONNECTION
	 * so that internal queries (e.g., sub-reports) inside the .jrxml still work.
	 */
	@Override
	public File generate(File reportDir, String jrxmlFileName, String format, File outputFile,
			List<LinkedHashMap<String, Object>> reportData, Map<String, String> params,
			String jdbcUrl, String jdbcUser, String jdbcPass) throws Exception {

		File jrxmlFile = new File(reportDir, jrxmlFileName);
		if (!jrxmlFile.exists()) {
			throw new IllegalArgumentException("Template not found: " + jrxmlFile.getAbsolutePath());
		}

		log.info("Compiling {} ...", jrxmlFile.getName());
		JasperReport report = JasperCompileManager.getInstance(CONTEXT).compile(jrxmlFile.getAbsolutePath());

		Map<String, Object> jasperParams = new HashMap<>();
		jasperParams.put("SUBREPORT_DIR", reportDir.getAbsolutePath() + File.separator);

		if (params != null && !params.isEmpty()) {
			coerceAndPutParams(report, jasperParams, params);
		}

		List<LinkedHashMap<String, Object>> flatData = flattenNestedData(reportData);

		@SuppressWarnings("unchecked")
		List<Map<String, ?>> castedData = (List<Map<String, ?>>) (List<?>) flatData;
		JRMapCollectionDataSource dataSource = new JRMapCollectionDataSource(castedData);

		Connection conn = null;
		try {
			if (jdbcUrl != null && !jdbcUrl.isEmpty()) {
				conn = DriverManager.getConnection(jdbcUrl, jdbcUser, jdbcPass != null ? jdbcPass : "");
				jasperParams.put(JRParameter.REPORT_CONNECTION, conn);
			}

			// If the .jrxml has its own queryString AND a DB connection is available,
			// use the connection so JR executes the query. Otherwise use the in-memory data.
			JasperPrint print;
			if (report.getQuery() != null && conn != null) {
				log.info("Template has queryString — filling with DB connection");
				print = JasperFillManager.getInstance(CONTEXT).fill(report, jasperParams, conn);
			} else {
				print = JasperFillManager.getInstance(CONTEXT).fill(report, jasperParams, dataSource);
			}
			log.info("Report filled: {} page(s)", print.getPages().size());

			if (outputFile.getParentFile() != null) {
				outputFile.getParentFile().mkdirs();
			}

			log.info("Exporting to {} ...", format.toUpperCase());
			export(print, format, outputFile);

			log.info("Output written to: {}", outputFile.getAbsolutePath());
			return outputFile;
		} finally {
			if (conn != null) {
				try { conn.close(); } catch (Exception ignored) {}
			}
		}
	}

	private void export(JasperPrint print, String format, File outFile) throws Exception {
		switch (format.toLowerCase()) {
			case "pdf": {
				JRPdfExporter exporter = new JRPdfExporter();
				exporter.setExporterInput(new SimpleExporterInput(print));
				exporter.setExporterOutput(new SimpleOutputStreamExporterOutput(outFile));
				exporter.exportReport();
				break;
			}
			case "xlsx": {
				JRXlsxExporter exporter = new JRXlsxExporter();
				exporter.setExporterInput(new SimpleExporterInput(print));
				exporter.setExporterOutput(new SimpleOutputStreamExporterOutput(outFile));
				exporter.exportReport();
				break;
			}
			case "csv": {
				JRCsvExporter exporter = new JRCsvExporter();
				exporter.setExporterInput(new SimpleExporterInput(print));
				exporter.setExporterOutput(new SimpleWriterExporterOutput(outFile));
				exporter.exportReport();
				break;
			}
			case "html": {
				HtmlExporter exporter = new HtmlExporter();
				exporter.setExporterInput(new SimpleExporterInput(print));
				exporter.setExporterOutput(new SimpleHtmlExporterOutput(outFile));
				exporter.exportReport();
				break;
			}
			default:
				throw new IllegalArgumentException(
						"Unsupported format: " + format + ". Supported: pdf, xlsx, csv, html");
		}
	}

	/**
	 * Flattens nested master-detail data for JasperReports grouping.
	 * If a row contains a List&lt;Map&gt; value (e.g. "details"), the master fields
	 * are duplicated for each child row, producing flat denormalized output.
	 * Rows without nested lists pass through unchanged.
	 */
	@SuppressWarnings("unchecked")
	private List<LinkedHashMap<String, Object>> flattenNestedData(List<LinkedHashMap<String, Object>> reportData) {
		List<LinkedHashMap<String, Object>> result = new ArrayList<>();

		for (LinkedHashMap<String, Object> row : reportData) {
			// Find the first List<Map> value in this row (the nested details)
			String nestedKey = null;
			List<Map<String, Object>> nestedList = null;

			for (Map.Entry<String, Object> entry : row.entrySet()) {
				if (entry.getValue() instanceof List) {
					List<?> candidate = (List<?>) entry.getValue();
					if (!candidate.isEmpty() && candidate.get(0) instanceof Map) {
						nestedKey = entry.getKey();
						nestedList = (List<Map<String, Object>>) entry.getValue();
						break;
					}
				}
			}

			if (nestedList == null) {
				// No nested data — pass through as-is
				result.add(row);
			} else {
				// Flatten: for each child row, create a new row with master fields + child fields
				for (Map<String, Object> childRow : nestedList) {
					LinkedHashMap<String, Object> flatRow = new LinkedHashMap<>();
					// Copy master fields (skip the nested list itself)
					for (Map.Entry<String, Object> entry : row.entrySet()) {
						if (!entry.getKey().equals(nestedKey)) {
							flatRow.put(entry.getKey(), entry.getValue());
						}
					}
					// Merge child fields
					flatRow.putAll(childRow);
					result.add(flatRow);
				}
			}
		}

		return result;
	}

	private void coerceAndPutParams(JasperReport report, Map<String, Object> target,
			Map<String, String> source) {
		Map<String, Class<?>> paramTypes = new HashMap<>();
		for (JRParameter p : report.getParameters()) {
			// Skip JasperReports system-defined parameters — we must not overwrite them
			if (p.isSystemDefined()) {
				continue;
			}
			paramTypes.put(p.getName(), p.getValueClass());
		}

		for (Map.Entry<String, String> entry : source.entrySet()) {
			String name = entry.getKey();
			String raw = entry.getValue();
			Class<?> type = paramTypes.get(name);
			if (type != null) {
				try {
					target.put(name, coerceValue(raw, type));
				} catch (Exception e) {
					// Coercion failed (e.g., empty string to Integer) — pass raw value
					// and let JasperReports handle it; better than a stacktrace
					log.debug("Could not coerce param '{}' value '{}' to {}: {}",
							name, raw, type.getSimpleName(), e.getMessage());
					target.put(name, raw);
				}
			} else {
				target.put(name, raw);
			}
		}
	}

	private Object coerceValue(String raw, Class<?> type) {
		if (type == String.class)
			return raw;
		if (type == Integer.class || type == int.class)
			return Integer.parseInt(raw);
		if (type == Long.class || type == long.class)
			return Long.parseLong(raw);
		if (type == Double.class || type == double.class)
			return Double.parseDouble(raw);
		if (type == Float.class || type == float.class)
			return Float.parseFloat(raw);
		if (type == Boolean.class || type == boolean.class)
			return Boolean.parseBoolean(raw);
		if (type == Short.class || type == short.class)
			return Short.parseShort(raw);
		if (type == java.math.BigDecimal.class)
			return new java.math.BigDecimal(raw);
		if (type == java.sql.Date.class)
			return java.sql.Date.valueOf(raw);
		if (type == java.sql.Timestamp.class)
			return java.sql.Timestamp.valueOf(raw);
		if (type == java.util.Date.class)
			return java.sql.Date.valueOf(raw);
		return raw;
	}
}
