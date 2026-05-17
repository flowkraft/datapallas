package com.flowkraft.jobs.controllers;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import jakarta.validation.constraints.NotNull;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.common.AppPaths;
import com.flowkraft.jobs.models.ClientServerCommunicationInfo;
import com.flowkraft.jobs.models.FileInfo;
import com.flowkraft.jobs.services.JobExecutionService;
import com.flowkraft.jobs.services.JobsService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping(value = "/api/jobs", produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
public class JobsController {

	private static final Logger log = LoggerFactory.getLogger(JobsController.class);

	@Autowired
	JobsService jobsService;

	@Autowired
	JobExecutionService jobExecutionService;

	@GetMapping("/stats")
	public Flux<FileInfo> getStats() throws Exception {

		return Flux.fromStream(jobsService.fetchStats());

	}

	@PostMapping("/pause")
	public Mono<ResponseEntity<Void>> pauseJob(
			@RequestBody @NotNull ClientServerCommunicationInfo clientServerCommunicationInfo) throws Exception {

		String pauseFilePath = AppPaths.JOBS_DIR_PATH + "/"
				+ FilenameUtils.getBaseName(clientServerCommunicationInfo.info) + ".pause";
		FileUtils.touch(new File(pauseFilePath));
		return Mono.just(new ResponseEntity<Void>(HttpStatus.OK));
	}

	@PostMapping("/cancel")
	public Mono<ResponseEntity<Void>> cancelJob(
			@RequestBody @NotNull ClientServerCommunicationInfo clientServerCommunicationInfo) throws Exception {

		String cancelFilePath = AppPaths.JOBS_DIR_PATH + "/"
				+ FilenameUtils.getBaseName(clientServerCommunicationInfo.info) + ".cancel";
		FileUtils.touch(new File(cancelFilePath));
		// Also handle the cancel-resume cleanup (folded from DELETE /cancel/resume)
		if (clientServerCommunicationInfo.id != null)
			FileUtils.deleteQuietly(new File(clientServerCommunicationInfo.id));
		if (clientServerCommunicationInfo.info != null)
			FileUtils.deleteQuietly(new File(clientServerCommunicationInfo.info));
		return Mono.just(new ResponseEntity<Void>(HttpStatus.OK));
	}

	@PostMapping("/resume")
	public Mono<ResponseEntity<Void>> doResumeJob(
			@RequestBody @NotNull ClientServerCommunicationInfo clientServerCommunicationInfo) throws Exception {

		//System.out.println(clientServerCommunicationInfo.id);
		//System.out.println(clientServerCommunicationInfo.info);

		jobsService.doResume(clientServerCommunicationInfo);

		return Mono.just(new ResponseEntity<Void>(HttpStatus.OK));
	}

	@DeleteMapping(value = "/quarantine", consumes = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<Void>> clearQuarantinedFiles() throws Exception {

		// System.out.println("Controller clearQuarantinedFiles");

		File quarantineDirectory = new File(AppPaths.QUARANTINE_DIR_PATH);
		FileUtils.cleanDirectory(quarantineDirectory);
		return Mono.just(new ResponseEntity<Void>(HttpStatus.OK));

	}

	@DeleteMapping("/temp/{folderName}")
	public Mono<ResponseEntity<Void>> clearTempFiles(@PathVariable String folderName) throws Exception {

		//System.out.println("Controller /temp/{folderName}");

		long activeJobs = jobsService.fetchStats().count();

		if (activeJobs == 0)
			FileUtils.deleteQuietly(new File(AppPaths.JOBS_DIR_PATH + "/" + folderName));

		return Mono.just(new ResponseEntity<Void>(HttpStatus.OK));
	}

	// ========== IN-PROCESS JOB EXECUTION (replaces DataPallas.bat spawning) ==========

	/**
	 * Burst a document into individual files based on burst tokens.
	 *
	 * @param request { inputFile, reportId?, testAll?, testList?, testRandom? }
	 *                inputFile accepts both relative and absolute paths — same as CLI.
	 *                reportId is resolved to a config file path via resolveSettingsPath().
	 *                QA testing: testAll (boolean), testList (comma-separated), testRandom (count).
	 */
	@PostMapping(value = "/burst", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, String>>> submitBurst(@RequestBody Map<String, Object> request) {
		String inputFile = (String) request.get("inputFile");
		String reportId = (String) request.get("reportId");

		if (inputFile == null || inputFile.isBlank()) {
			return Mono.just(ResponseEntity.badRequest().body(Map.of("error", "inputFile is required")));
		}

		List<String> args = new ArrayList<>();
		args.add("job");
		args.add("burst");
		args.add(resolveFilePath(inputFile));

		if (reportId != null && !reportId.isBlank()) {
			String configPath = resolveSettingsPath(reportId);
			args.add("-c");
			args.add(configPath);
		}

		// QA testing options (same as CLI -ta, -tl, -tr flags)
		if (Boolean.TRUE.equals(request.get("testAll"))) {
			args.add("-ta");
		} else if (request.get("testList") != null) {
			args.add("-tl");
			args.add(String.valueOf(request.get("testList")));
		} else if (request.get("testRandom") != null) {
			args.add("-tr");
			args.add(String.valueOf(request.get("testRandom")));
		}

		log.info("Submitting burst job: {}", args);
		jobExecutionService.executeAsync(args.toArray(new String[0]));
		return Mono.just(ResponseEntity.ok(Map.of("status", "submitted")));
	}

	/**
	 * Generate reports from a data source using a configuration template.
	 *
	 * @param request { reportId: "payslips", input?: "data.csv", params?: { startDate: "2025-01-01" } }
	 *                reportId is required — resolved to config path.
	 *                input is the input data identifier (filename, template name, or report name).
	 *                params are key-value pairs passed as -p arguments.
	 */
	@PostMapping(value = "/generate", consumes = MediaType.APPLICATION_JSON_VALUE)
	@SuppressWarnings("unchecked")
	public Mono<ResponseEntity<Map<String, String>>> submitGenerate(@RequestBody Map<String, Object> request) {
		String reportId = (String) request.get("reportId");
		String input = (String) request.get("input");
		Map<String, String> params = (Map<String, String>) request.get("params");

		if (reportId == null || reportId.isBlank()) {
			return Mono.just(ResponseEntity.badRequest().body(Map.of("error", "reportId is required")));
		}

		String configPath = resolveSettingsPath(reportId);

		List<String> args = new ArrayList<>();
		args.add("job");
		args.add("generate");
		args.add("-c");
		args.add(configPath);

		if (input != null && !input.isBlank()) {
			// If the input is a file path (contains / or \), resolve it.
			// If it's a template name (e.g., "g-sql2fop-stud"), leave it as-is.
			if (input.contains("/") || input.contains("\\")) {
				args.add(resolveFilePath(input));
			} else {
				args.add(input);
			}
		} else {
			// For SQL/Script data sources, the reportId doubles as the input name.
			// The CLI equivalent: DataPallas generate -c config/.../settings.xml g-sql2fop-stud
			args.add(reportId);
		}

		if (params != null) {
			for (Map.Entry<String, String> entry : params.entrySet()) {
				args.add("-p");
				args.add(entry.getKey() + "=" + entry.getValue());
			}
		}

		// QA testing options (same as burst endpoint)
		if (Boolean.TRUE.equals(request.get("testAll"))) {
			args.add("-ta");
		} else if (request.get("testList") != null) {
			args.add("-tl");
			args.add(String.valueOf(request.get("testList")));
		} else if (request.get("testRandom") != null) {
			args.add("-tr");
			args.add(String.valueOf(request.get("testRandom")));
		}

		log.info("Submitting generate job: {}", args);
		jobExecutionService.executeAsync(args.toArray(new String[0]));
		return Mono.just(ResponseEntity.ok(Map.of("status", "submitted")));
	}

	/**
	 * Merge multiple documents into one, optionally burst the result.
	 *
	 * @param request { listFile: "temp/merge-abc", outputName: "combined.pdf", burst?: true, reportId?: "..." }
	 */
	/**
	 * Prepare a merge file list. Takes an array of file paths, writes them
	 * to a temp file (one per line), returns the temp file path for use with /merge.
	 * Replaces the old shellService.generateMergeFileInTempFolder().
	 */
	@SuppressWarnings("unchecked")
	@PostMapping(value = "/merge-prepare-list", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, String>>> prepareMergeList(@RequestBody Map<String, Object> request) throws Exception {
		List<String> filePaths = (List<String>) request.get("filePaths");
		if (filePaths == null || filePaths.isEmpty()) {
			return Mono.just(ResponseEntity.badRequest().body(Map.of("error", "filePaths is required")));
		}

		String uniqueId = Long.toString(System.currentTimeMillis(), 36)
				+ Long.toString((long) (Math.random() * 1e9), 36);
		String listFilePath = "temp/merge-files-" + uniqueId;
		String fullPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/" + listFilePath;

		// Resolve each path against PORTABLE_EXECUTABLE_DIR so both absolute
		// paths (from REST tests) and relative paths (from UI samples) work.
		List<String> resolvedPaths = filePaths.stream()
				.map(this::resolveFilePath)
				.collect(Collectors.toList());
		Files.createDirectories(Path.of(fullPath).getParent());
		Files.writeString(Path.of(fullPath), String.join("\n", resolvedPaths));

		return Mono.just(ResponseEntity.ok(Map.of("listFile", listFilePath)));
	}

	/**
	 * Merge multiple documents into one, optionally burst the result.
	 */
	@PostMapping(value = "/merge", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, String>>> submitMerge(@RequestBody Map<String, Object> request) {
		String listFile = (String) request.get("listFile");
		String outputName = (String) request.get("outputName");
		Boolean burst = (Boolean) request.get("burst");
		String reportId = (String) request.get("reportId");

		if (listFile == null || listFile.isBlank()) {
			return Mono.just(ResponseEntity.badRequest().body(Map.of("error", "listFile is required")));
		}

		List<String> args = new ArrayList<>();
		args.add("job");
		args.add("merge");
		args.add(resolveFilePath(listFile));

		if (outputName != null && !outputName.isBlank()) {
			args.add("-o");
			args.add(outputName);
		}

		if (Boolean.TRUE.equals(burst)) {
			args.add("-b");
			if (reportId != null && !reportId.isBlank()) {
				String configPath = resolveSettingsPath(reportId);
				args.add("-c");
				args.add(configPath);
			}
		}

		log.info("Submitting merge job: {}", args);
		jobExecutionService.executeAsync(args.toArray(new String[0]));
		return Mono.just(ResponseEntity.ok(Map.of("status", "submitted")));
	}

	// ── V5.3: Jasper report generation ──

	/**
	 * POST /api/jobs/generate-jasper — compile and export a JasperReports template.
	 * Stub: full implementation in a later sprint; delegates to {@code job generate-jasper} CLI once implemented.
	 */
	@PostMapping(value = "/generate-jasper", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, String>>> submitGenerateJasper(@RequestBody Map<String, Object> request) {
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
				.body(Map.of("error", "generate-jasper not yet implemented — use the jasper CLI command directly")));
	}

	// ========== ATOMIC BURST PIPELINE OPERATIONS (V2.5 — exposed phases) ==========

	@PostMapping(value = "/split", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, String>>> submitSplit(@RequestBody Map<String, Object> request) {
		// TODO V2.5: expose the split-only phase of the burst pipeline (no delivery)
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
				.body(Map.of("error", "split endpoint not yet implemented — use /burst for the full pipeline")));
	}

	@PostMapping(value = "/deliver", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, String>>> submitDeliver(@RequestBody Map<String, Object> request) {
		// TODO V2.5: deliver pre-split outputs (retry delivery without re-splitting)
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
				.body(Map.of("error", "deliver endpoint not yet implemented")));
	}

	@PostMapping(value = "/preview-recipient", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, String>>> submitPreviewRecipient(@RequestBody Map<String, Object> request) {
		// TODO V2.5: personalization preview for one recipient
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
				.body(Map.of("error", "preview-recipient endpoint not yet implemented")));
	}

	@PostMapping(value = "/qa", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, String>>> submitQa(@RequestBody Map<String, Object> request) {
		// TODO V2.5: run QA checks on an already-bursted output dir
		// -ta/-tl/-tr flags reuse same names as /burst endpoint
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
				.body(Map.of("error", "qa endpoint not yet implemented — use /burst with -ta/-tl/-tr flags for QA")));
	}

	// ── Path resolution (same logic as ReportsController.resolveSettingsPath) ──

	private String resolveSettingsPath(String reportId) {
		String reportsPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/config/reports/" + reportId + "/settings.xml";
		if (new File(reportsPath).exists()) return reportsPath;

		String samplesPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/config/samples/" + reportId + "/settings.xml";
		if (new File(samplesPath).exists()) return samplesPath;

		String frendSamplesPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/config/samples/_frend/" + reportId + "/settings.xml";
		if (new File(frendSamplesPath).exists()) return frendSamplesPath;

		String jasperPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/config/reports-jasper/" + reportId + "/settings.xml";
		if (new File(jasperPath).exists()) return jasperPath;

		String burstPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/config/burst/settings.xml";
		if ("burst".equals(reportId) && new File(burstPath).exists()) return burstPath;

		return reportsPath;
	}

	/**
	 * Resolve a file path against PORTABLE_EXECUTABLE_DIR if relative.
	 * Absolute paths are returned as-is.
	 * The CLI's DataPallas.bat cd's into the installation dir, so relative paths
	 * work there. For in-process execution, the JVM CWD is bkend/server/ — relative
	 * paths must be resolved against PORTABLE_EXECUTABLE_DIR.
	 */
	private String resolveFilePath(String filePath) {
		if (filePath == null || filePath.isBlank()) return filePath;
		File f = new File(filePath);
		if (f.isAbsolute()) return filePath;
		return new File(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, filePath).getAbsolutePath();
	}

}
