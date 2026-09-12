package com.flowkraft.jasperlegacy;

import java.io.File;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import net.sf.jasperreports.engine.JasperReportsContext;

/**
 * One resource, one verb: you POST a render request and the rendered document
 * comes back. Every field maps one-to-one onto a jr.bat option, so the two
 * interfaces stay readable against each other.
 *
 *   POST /api/reports/render   -> the document bytes
 *   GET  /api/health           -> engine status
 */
@RestController
@RequestMapping("/api")
public class RenderController {

	/** Mirrors the CLI options field for field, plus the rows the CLI cannot carry. */
	public static class RenderRequest {
		public String reportDir;
		public String jrxml;
		public String format = "pdf";
		public String jdbcUrl;
		public String jdbcUser;
		public String jdbcPass;
		public Map<String, String> params = new LinkedHashMap<>();
		/**
		 * Rows from DataPallas's data pipeline, read by the template as fields. This
		 * is what lets a wrapper report — one template, one document per row — work
		 * the same on this engine as on the embedded one.
		 */
		public List<Map<String, Object>> data;
	}

	@GetMapping("/health")
	public Map<String, Object> health() {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("status", "ok");
		body.put("engine", "JasperReports");
		body.put("version", JasperReportsContext.class.getPackage().getImplementationVersion());
		body.put("formats", new String[] { "pdf", "xlsx", "csv", "html" });
		return body;
	}

	@PostMapping("/reports/render")
	public ResponseEntity<?> render(@RequestBody RenderRequest request) {
		if (request.reportDir == null || request.reportDir.isEmpty()) {
			return badRequest("reportDir is required");
		}
		if (request.jrxml == null || request.jrxml.isEmpty()) {
			return badRequest("jrxml is required");
		}

		File output = null;
		try {
			// Rendered to a temp file rather than memory: JasperReports' exporters
			// write to streams of very different shapes, and a file is the one
			// target all four agree on — the same one the CLI uses.
			output = File.createTempFile("jasper-legacy-", "." + request.format);

			new JasperLegacyEngine(m -> System.out.println("INFO - " + m)).render(
					new File(request.reportDir),
					request.jrxml,
					request.format,
					output,
					request.jdbcUrl,
					request.jdbcUser,
					request.jdbcPass,
					request.params,
					request.data);

			byte[] bytes = Files.readAllBytes(output.toPath());

			String baseName = request.jrxml.replaceFirst("\\.jrxml$", "");
			return ResponseEntity.ok()
					.contentType(MediaType.parseMediaType(JasperLegacyEngine.contentTypeFor(request.format)))
					.header(HttpHeaders.CONTENT_DISPOSITION,
							"attachment; filename=\"" + baseName + "." + request.format + "\"")
					.body(bytes);

		} catch (IllegalArgumentException e) {
			// A bad template name or an unsupported format is the caller's mistake.
			return badRequest(e.getMessage());
		} catch (Exception e) {
			Map<String, String> body = new LinkedHashMap<>();
			body.put("status", "error");
			body.put("message", String.valueOf(e.getMessage()));
			return ResponseEntity.internalServerError().body(body);
		} finally {
			if (output != null) {
				output.delete();
			}
		}
	}

	private ResponseEntity<Map<String, String>> badRequest(String message) {
		Map<String, String> body = new LinkedHashMap<>();
		body.put("status", "error");
		body.put("message", message);
		return ResponseEntity.badRequest().body(body);
	}
}
