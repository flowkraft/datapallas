package com.flowkraft.jobs.controllers;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.flowkraft.common.AppPaths;
import com.flowkraft.jobs.models.JobRecord;
import com.sourcekraft.documentburster.utils.Utils;
import com.flowkraft.jobs.services.JobExecutionService;
import com.flowkraft.jobs.services.JobStore;
import com.flowkraft.jobs.services.JobsService;

import reactor.core.publisher.Mono;

@RestController
@RequestMapping(value = "/api/jobs", produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
public class JobsController {

	private static final Logger log = LoggerFactory.getLogger(JobsController.class);

	@Autowired
	JobsService jobsService;

	@Autowired
	JobExecutionService jobExecutionService;

	@Autowired
	JobStore jobStore;

	// ── Async job dispatch ─────────────────────────────────────────────────────

	/**
	 * POST /api/jobs — unified async dispatch.
	 * Body: { type: "burst"|"generate"|"merge", ...type-specific params }
	 * Returns 202 Accepted + Location: /api/jobs/{id} + body { jobId, status }.
	 */
	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
	public ResponseEntity<Map<String, Object>> submitJob(@RequestBody Map<String, Object> request) {
		String type = (String) request.get("type");
		if (type == null || type.isBlank()) {
			return ResponseEntity.badRequest().body(Map.of("error", "type is required"));
		}

		List<String> args = new ArrayList<>();
		String jobSignalBaseName;

		switch (type) {
			case "burst": {
				String inputFile = (String) request.get("inputFile");
				if (inputFile == null || inputFile.isBlank())
					return ResponseEntity.badRequest().body(Map.of("error", "inputFile is required for burst"));
				args.add("job"); args.add("burst"); args.add(resolveFilePath(inputFile));
				String reportId = (String) request.get("reportId");
				if (reportId != null && !reportId.isBlank()) { args.add("-c"); args.add(resolveSettingsPath(reportId)); }
				addQaArgs(args, request);
				jobSignalBaseName = FilenameUtils.getBaseName(inputFile);
				break;
			}
			case "generate": {
				String reportId = (String) request.get("reportId");
				if (reportId == null || reportId.isBlank())
					return ResponseEntity.badRequest().body(Map.of("error", "reportId is required for generate"));
				args.add("job"); args.add("generate"); args.add("-c"); args.add(resolveSettingsPath(reportId));
				String input = (String) request.get("input");
				if (input != null && !input.isBlank()) {
					args.add(input.contains("/") || input.contains("\\") ? resolveFilePath(input) : input);
				} else {
					args.add(reportId);
				}
				addParamArgs(args, request);
				addQaArgs(args, request);
				jobSignalBaseName = reportId;
				break;
			}
			case "merge": {
				String listFile = (String) request.get("listFile");
				if (listFile == null || listFile.isBlank())
					return ResponseEntity.badRequest().body(Map.of("error", "listFile is required for merge"));
				args.add("job"); args.add("merge"); args.add(resolveFilePath(listFile));
				String outputName = (String) request.get("outputName");
				if (outputName != null && !outputName.isBlank()) { args.add("-o"); args.add(outputName); }
				if (Boolean.TRUE.equals(request.get("burst"))) {
					args.add("-b");
					String reportId = (String) request.get("reportId");
					if (reportId != null && !reportId.isBlank()) { args.add("-c"); args.add(resolveSettingsPath(reportId)); }
				}
				jobSignalBaseName = FilenameUtils.getBaseName(listFile);
				break;
			}
			default:
				return ResponseEntity.badRequest().body(Map.of("error", "Unknown job type: " + type));
		}

		JobRecord job = jobStore.create(type, request, jobSignalBaseName);
		jobExecutionService.executeTracked(args.toArray(new String[0]), job.id, jobStore);
		log.info("Dispatched {} job id={}", type, job.id);
		return ResponseEntity.status(HttpStatus.ACCEPTED)
				.header("Location", "/api/jobs/" + job.id)
				.body(Map.of("jobId", job.id, "status", job.status));
	}

	// ── Job resource endpoints ─────────────────────────────────────────────────

	/** GET /api/jobs — list recent jobs, replacing GET /api/jobs/stats. */
	@GetMapping(consumes = MediaType.ALL_VALUE)
	public ResponseEntity<List<Map<String, Object>>> listJobs(
			@RequestParam(required = false) String status,
			@RequestParam(defaultValue = "20") int limit) {
		List<Map<String, Object>> out = jobStore.list(status, limit).stream()
				.map(JobRecord::toMap).toList();
		return ResponseEntity.ok(out);
	}

	/** GET /api/jobs/{id} — status of a single job. */
	@GetMapping(value = "/{id}", consumes = MediaType.ALL_VALUE)
	public ResponseEntity<Map<String, Object>> getJob(@PathVariable String id) {
		return jobStore.find(id)
				.map(rec -> ResponseEntity.ok(rec.toMap()))
				.orElse(ResponseEntity.notFound().<Map<String, Object>>build());
	}

	/** GET /api/jobs/{id}/logs — SSE stream of status events for a job. */
	@GetMapping(value = "/{id}/logs", produces = MediaType.TEXT_EVENT_STREAM_VALUE, consumes = MediaType.ALL_VALUE)
	public SseEmitter getJobLogs(@PathVariable String id) {
		Optional<JobRecord> optRec = jobStore.find(id);
		if (optRec.isEmpty()) {
			SseEmitter dead = new SseEmitter(0L);
			try {
				dead.send(SseEmitter.event().name("error").data(Map.of("error", "Unknown jobId: " + id)));
				dead.complete();
			} catch (Exception ignored) {}
			return dead;
		}
		JobRecord job = optRec.get();
		if ("done".equals(job.status) || "failed".equals(job.status)) {
			SseEmitter terminal = new SseEmitter(0L);
			try {
				terminal.send(SseEmitter.event().name("status").data(Map.of("status", job.status, "id", id)));
				terminal.complete();
			} catch (Exception ignored) {}
			return terminal;
		}
		SseEmitter existing = jobStore.getEmitter(id);
		return existing != null ? existing : jobStore.createEmitter(id);
	}

	/** DELETE /api/jobs/{id} — cancel a running job. */
	@DeleteMapping(value = "/{id}", consumes = MediaType.ALL_VALUE)
	public ResponseEntity<Void> cancelJob(@PathVariable String id) {
		Optional<JobRecord> optRec = jobStore.find(id);
		if (optRec.isEmpty()) return ResponseEntity.notFound().build();
		JobRecord rec = optRec.get();
		if (!rec.jobSignalBaseName.isBlank()) {
			try {
				FileUtils.touch(new File(AppPaths.JOBS_DIR_PATH + "/" + rec.jobSignalBaseName + ".cancel"));
			} catch (Exception e) {
				log.warn("Could not touch cancel file for job {}: {}", id, e.getMessage());
			}
		}
		jobStore.updateStatus(id, "failed");
		return ResponseEntity.noContent().build();
	}

	/** PATCH /api/jobs/{id} — pause or resume a job. Body: { action: "pause"|"resume" } */
	@PatchMapping(value = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
	public ResponseEntity<Map<String, Object>> patchJob(
			@PathVariable String id,
			@RequestBody Map<String, Object> body) {
		String action = (String) body.get("action");
		Optional<JobRecord> optRec = jobStore.find(id);
		if (optRec.isEmpty()) return ResponseEntity.notFound().build();
		JobRecord rec = optRec.get();
		switch (String.valueOf(action)) {
			case "pause":
				if (!rec.jobSignalBaseName.isBlank()) {
					try {
						FileUtils.touch(new File(AppPaths.JOBS_DIR_PATH + "/" + rec.jobSignalBaseName + ".pause"));
					} catch (Exception e) {
						log.warn("Could not touch pause file for job {}: {}", id, e.getMessage());
					}
				}
				jobStore.updateStatus(id, "paused");
				break;
			case "resume":
				jobStore.updateStatus(id, "running");
				break;
			default:
				return ResponseEntity.badRequest().body(Map.of("error", "Unknown action: " + action));
		}
		return ResponseEntity.ok(rec.toMap());
	}

	// ── Housekeeping endpoints (scope boundary — these are NOT touched by C9) ──

	/** DELETE /api/jobs/quarantine — clear quarantined files. */
	@DeleteMapping(value = "/quarantine", consumes = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<Void>> clearQuarantinedFiles() throws Exception {
		FileUtils.cleanDirectory(new File(AppPaths.QUARANTINE_DIR_PATH));
		return Mono.just(new ResponseEntity<>(HttpStatus.OK));
	}

	/** DELETE /api/jobs/temp/{folderName} — clear temp folder for a completed job. */
	@DeleteMapping("/temp/{folderName}")
	public Mono<ResponseEntity<Void>> clearTempFiles(@PathVariable String folderName) throws Exception {
		long activeJobs = jobsService.fetchStats().count();
		if (activeJobs == 0)
			FileUtils.deleteQuietly(new File(AppPaths.JOBS_DIR_PATH + "/" + folderName));
		return Mono.just(new ResponseEntity<>(HttpStatus.OK));
	}

	/**
	 * DELETE /api/jobs/resume-file — remove a resume-pending job file.
	 * Used by the Angular "Clear this job" action for pre-C9 paused jobs
	 * that have no UUID in JobStore.
	 */
	@DeleteMapping(value = "/resume-file", consumes = MediaType.ALL_VALUE)
	public ResponseEntity<Void> clearResumeFile(@RequestParam String path) {
		try {
			FileUtils.deleteQuietly(new File(Utils.resolvePathAgainstPortableDir(path)));
		} catch (Exception e) {
			log.warn("Could not delete resume file {}: {}", path, e.getMessage());
		}
		return ResponseEntity.noContent().build();
	}

	/**
	 * POST /api/jobs/merge-prepare-list — prepare file list for a merge job.
	 * Utility endpoint that writes filePaths to a temp file and returns its path.
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
		String fullPath = Utils.resolvePathAgainstPortableDir(listFilePath);

		List<String> resolvedPaths = filePaths.stream()
				.map(this::resolveFilePath)
				.collect(Collectors.toList());
		Files.createDirectories(Path.of(fullPath).getParent());
		Files.writeString(Path.of(fullPath), String.join("\n", resolvedPaths));

		return Mono.just(ResponseEntity.ok(Map.of("listFile", listFilePath)));
	}

	// ── Private helpers ────────────────────────────────────────────────────────

	private void addQaArgs(List<String> args, Map<String, Object> request) {
		if (Boolean.TRUE.equals(request.get("testAll"))) {
			args.add("-ta");
		} else if (request.get("testList") != null) {
			args.add("-tl");
			args.add(String.valueOf(request.get("testList")));
		} else if (request.get("testRandom") != null) {
			args.add("-tr");
			args.add(String.valueOf(request.get("testRandom")));
		}
	}

	@SuppressWarnings("unchecked")
	private void addParamArgs(List<String> args, Map<String, Object> request) {
		Map<String, String> params = (Map<String, String>) request.get("params");
		if (params != null) {
			for (Map.Entry<String, String> entry : params.entrySet()) {
				args.add("-p");
				args.add(entry.getKey() + "=" + entry.getValue());
			}
		}
	}

	private String resolveSettingsPath(String reportId) {
		String reportsPath = Utils.resolvePathAgainstPortableDir("config/reports/" + reportId + "/settings.xml");
		if (new File(reportsPath).exists()) return reportsPath;

		String samplesPath = Utils.resolvePathAgainstPortableDir("config/samples/" + reportId + "/settings.xml");
		if (new File(samplesPath).exists()) return samplesPath;

		String frendSamplesPath = Utils.resolvePathAgainstPortableDir("config/samples/_frend/" + reportId + "/settings.xml");
		if (new File(frendSamplesPath).exists()) return frendSamplesPath;

		String jasperPath = Utils.resolvePathAgainstPortableDir("config/reports-jasper/" + reportId + "/settings.xml");
		if (new File(jasperPath).exists()) return jasperPath;

		String burstPath = Utils.resolvePathAgainstPortableDir("config/burst/settings.xml");
		if ("burst".equals(reportId) && new File(burstPath).exists()) return burstPath;

		return reportsPath;
	}

	private String resolveFilePath(String filePath) {
		if (filePath == null || filePath.isBlank()) return filePath;
		File f = new File(filePath);
		if (f.isAbsolute()) return filePath;
		return new File(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, filePath).getAbsolutePath();
	}
}
