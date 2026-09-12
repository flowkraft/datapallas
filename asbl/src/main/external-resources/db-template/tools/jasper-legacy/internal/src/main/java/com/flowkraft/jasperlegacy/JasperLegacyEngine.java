package com.flowkraft.jasperlegacy;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import net.sf.jasperreports.engine.DefaultJasperReportsContext;
import net.sf.jasperreports.engine.JREmptyDataSource;
import net.sf.jasperreports.engine.JRParameter;
import net.sf.jasperreports.engine.data.JRMapCollectionDataSource;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.SimpleJasperReportsContext;
import net.sf.jasperreports.repo.RepositoryService;
import net.sf.jasperreports.engine.export.HtmlExporter;
import net.sf.jasperreports.engine.export.JRCsvExporter;
import net.sf.jasperreports.engine.export.JRPdfExporter;
import net.sf.jasperreports.engine.export.ooxml.JRXlsxExporter;
import net.sf.jasperreports.export.SimpleExporterInput;
import net.sf.jasperreports.export.SimpleHtmlExporterOutput;
import net.sf.jasperreports.export.SimpleOutputStreamExporterOutput;
import net.sf.jasperreports.export.SimpleWriterExporterOutput;

/**
 * Compiles, fills and exports a classic .jrxml using the JasperReports 6 engine.
 *
 * The CLI and the REST service both come through here, so the two cannot drift:
 * a report rendered over HTTP behaves exactly as the same report rendered from
 * jr.bat. Behaviour deliberately mirrors DataPallas's own JasperReportRunner —
 * same SUBREPORT_DIR handling, same parameter coercion, same four formats.
 */
public class JasperLegacyEngine {

	public interface Listener {
		void onMessage(String message);
	}

	private final Listener listener;

	/**
	 * The engine's own context, carrying one extra repository so that a
	 * sub-report which exists only as .jrxml still renders. It inherits from the
	 * default context, so every extension found on the classpath — fonts, charts,
	 * barcodes — is still in play.
	 *
	 * Built once: the repository caches what it compiles, and that cache is only
	 * worth having if the context outlives a single render.
	 */
	private final SimpleJasperReportsContext context;

	public JasperLegacyEngine(Listener listener) {
		this.listener = listener;
		this.context = new SimpleJasperReportsContext(DefaultJasperReportsContext.getInstance());
		this.context.setExtensions(RepositoryService.class,
				Collections.singletonList(new CompilingReportRepository()));
	}

	public File render(File reportDir, String jrxmlFileName, String format, File outputFile,
			String jdbcUrl, String jdbcUser, String jdbcPass, Map<String, String> params) throws Exception {
		return render(reportDir, jrxmlFileName, format, outputFile, jdbcUrl, jdbcUser, jdbcPass, params, null);
	}

	/**
	 * @param reportData rows from DataPallas's own data pipeline, read by the
	 *                   template as fields. Null or empty means the template
	 *                   supplies its own rows, from its embedded query or from
	 *                   parameters.
	 */
	public File render(File reportDir, String jrxmlFileName, String format, File outputFile,
			String jdbcUrl, String jdbcUser, String jdbcPass, Map<String, String> params,
			List<Map<String, Object>> reportData) throws Exception {

		File jrxmlFile = new File(reportDir, jrxmlFileName);
		if (!jrxmlFile.exists()) {
			throw new IllegalArgumentException("Template not found: " + jrxmlFile.getAbsolutePath());
		}

		log("Compiling " + jrxmlFile.getName() + " ...");
		JasperReport report = JasperCompileManager.getInstance(context).compile(jrxmlFile.getAbsolutePath());

		Map<String, Object> jasperParams = new HashMap<>();
		// Studio bakes the author's own machine into SUBREPORT_DIR's default value.
		// Overriding it here is what makes subreports and images resolve against
		// the folder the report actually shipped in.
		jasperParams.put("SUBREPORT_DIR", reportDir.getAbsolutePath() + File.separator);
		if (params != null && !params.isEmpty()) {
			coerceAndPutParams(report, jasperParams, params);
		}

		Connection conn = null;
		try {
			if (jdbcUrl != null && !jdbcUrl.isEmpty()) {
				log("Connecting to database ...");
				conn = DriverManager.getConnection(jdbcUrl, jdbcUser, jdbcPass != null ? jdbcPass : "");
				jasperParams.put(JRParameter.REPORT_CONNECTION, conn);
			}

			// Same precedence as the JasperReports 7 path: a template carrying its own
			// query wins when a connection is available, otherwise the rows handed in
			// by DataPallas feed the fields, otherwise there is nothing to iterate.
			JasperPrint print;
			if (report.getQuery() != null && conn != null) {
				log("Template has queryString — filling with DB connection");
				print = JasperFillManager.getInstance(context).fill(report, jasperParams, conn);
			} else if (reportData != null && !reportData.isEmpty()) {
				print = JasperFillManager.getInstance(context).fill(report, jasperParams,
						new JRMapCollectionDataSource(flattenNestedData(reportData)));
			} else {
				print = JasperFillManager.getInstance(context).fill(report, jasperParams, new JREmptyDataSource());
			}
			log("Report filled: " + print.getPages().size() + " page(s)");

			if (outputFile.getParentFile() != null) {
				outputFile.getParentFile().mkdirs();
			}

			log("Exporting to " + format.toUpperCase() + " ...");
			export(print, format, outputFile);

			log("Output written to: " + outputFile.getAbsolutePath());
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
	 * Flattens nested master-detail rows for JasperReports grouping: when a row
	 * holds a List&lt;Map&gt; (e.g. "details"), the master fields are repeated for
	 * each child row. Rows without nested lists pass through unchanged. Mirrors
	 * the JasperReports 7 path so the same data produces the same document.
	 */
	@SuppressWarnings("unchecked")
	private List<Map<String, ?>> flattenNestedData(List<Map<String, Object>> reportData) {
		List<Map<String, ?>> result = new ArrayList<>();

		for (Map<String, Object> row : reportData) {
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
				result.add(row);
				continue;
			}

			for (Map<String, Object> childRow : nestedList) {
				LinkedHashMap<String, Object> flatRow = new LinkedHashMap<>();
				for (Map.Entry<String, Object> entry : row.entrySet()) {
					if (!entry.getKey().equals(nestedKey)) {
						flatRow.put(entry.getKey(), entry.getValue());
					}
				}
				flatRow.putAll(childRow);
				result.add(flatRow);
			}
		}

		return result;
	}

	public static String contentTypeFor(String format) {
		switch (format == null ? "" : format.toLowerCase()) {
			case "pdf":
				return "application/pdf";
			case "xlsx":
				return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
			case "csv":
				return "text/csv";
			case "html":
				return "text/html";
			default:
				return "application/octet-stream";
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

	private void coerceAndPutParams(JasperReport report, Map<String, Object> target,
			Map<String, String> source) {
		Map<String, Class<?>> paramTypes = new HashMap<>();
		for (JRParameter p : report.getParameters()) {
			// JasperReports' own parameters must not be overwritten.
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
					// Coercion failed — hand JasperReports the raw value and let it
					// report the problem in its own terms, rather than a stacktrace here.
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

	private void log(String message) {
		if (listener != null) {
			listener.onMessage(message);
		}
	}
}
