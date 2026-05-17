package com.flowkraft.system.controllers;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettingsInternal;
import com.sourcekraft.documentburster.utils.Utils;
import com.flowkraft.common.AppPaths;
import com.flowkraft.system.dtos.DirCriteriaDto;
import com.flowkraft.system.dtos.FileCriteriaDto;
import com.flowkraft.system.dtos.FindCriteriaDto;
import com.flowkraft.system.dtos.InspectResultDto;
import com.flowkraft.system.dtos.ProcessOutputResultDto;
import com.flowkraft.jobs.models.FileInfo;
import com.flowkraft.system.models.SystemInfo;
import com.flowkraft.system.services.DockerService;
import com.flowkraft.system.services.FileSystemService;
import com.flowkraft.system.services.ProcessService;
import com.flowkraft.system.services.SystemService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping(value = "/api/system", produces = MediaType.APPLICATION_JSON_VALUE)
public class SystemController {

	@Autowired
	SystemService systemService;

	@Autowired
	FileSystemService fileSystemService;

	@Autowired
	ProcessService processService;

	@Autowired
	DockerService dockerService;

	// ============================================================
	//  System Info — read-only metadata about the running system
	// ============================================================

	@GetMapping("/test-url")
	public Mono<Boolean> checkUrl(@RequestParam String url) throws Exception {
		String decodedUrl = URLDecoder.decode(url, StandardCharsets.UTF_8.toString());
		return systemService.checkUrl(decodedUrl);
	}

	@GetMapping("/info/changelog")
	public Mono<String> getChangelog(@RequestParam String itemName) throws Exception {
		String itemNameDecoded = URLDecoder.decode(itemName, StandardCharsets.UTF_8.toString());
		return systemService.getChangelog(itemNameDecoded);
	}

	@GetMapping("/info/news")
	public Mono<String> getNews() {
		return systemService.getBlogPosts();
	}

	@GetMapping("/info")
	public Mono<SystemInfo> getSystemInfo() throws Exception {
		SystemInfo info = systemService.getSystemInfo();
		return Mono.just(info);
	}

	@GetMapping(value = "/info/copilot-url", produces = MediaType.TEXT_PLAIN_VALUE)
	public Mono<String> getCopilotUrl() {
		return systemService.getCopilotUrl();
	}

	// ============================================================
	//  Preferences — load/save user preferences
	// ============================================================

	@GetMapping(value = "/preferences")
	public Mono<DocumentBursterSettingsInternal> getPreferences() {
		return Mono.fromCallable(() -> systemService.loadInternalSettings());
	}

	@PostMapping(value = "/preferences")
	public Mono<Void> savePreferences(@RequestBody DocumentBursterSettingsInternal settings) {
		return Mono.fromRunnable(() -> {
			try {
				systemService.saveInternalSettings(settings);
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		});
	}

	// ============================================================
	//  Host Package Management — Chocolatey install/uninstall
	// ============================================================

	@PostMapping("/install/chocolatey")
	public Mono<ProcessOutputResultDto> installChocolatey() throws Exception {
		return processService.installChocolatey();
	}

	@PostMapping("/uninstall/chocolatey")
	public Mono<ProcessOutputResultDto> uninstallChocolatey() throws Exception {
		return processService.unInstallChocolatey();
	}

	// ============================================================
	//  Managed Services — local services lifecycle + status
	// ============================================================

	@PostMapping("/test-email-server/start")
	public Mono<ProcessOutputResultDto> startTestEmailServer() throws Exception {
		return processService.spawn(
			java.util.Arrays.asList("startTestEmailServer.bat"),
			Optional.of("tools/test-email-server")
		);
	}

	@PostMapping("/test-email-server/stop")
	public Mono<ProcessOutputResultDto> stopTestEmailServer() throws Exception {
		return processService.spawn(
			java.util.Arrays.asList("shutTestEmailServer.bat"),
			Optional.of("tools/test-email-server")
		);
	}

	@GetMapping("/services/status")
	public Mono<List<DockerService.ServiceStatusInfo>> getServicesStatus(@RequestParam Optional<Boolean> forceProbe, @RequestParam Optional<Boolean> skipProbe) throws Exception {
		boolean force = forceProbe.orElse(false);
		boolean skip = skipProbe.orElse(false);
		List<DockerService.ServiceStatusInfo> statuses = dockerService.getAllServicesStatus(force, skip);
		return Mono.just(statuses);
	}

	// ============================================================
	//  Application Lifecycle — self-update + feedback
	// ============================================================

	@PostMapping("/update/apply")
	public Mono<ProcessOutputResultDto> applyUpdate(@RequestBody Map<String, String> request) throws Exception {
		String jobFilePath = request.get("jobFilePath");
		String resolvedPath = Utils.resolvePathAgainstPortableDir(jobFilePath);
		return processService.spawn(
			java.util.Arrays.asList("rb_rust_updater", "--job_file_path", resolvedPath, "2>&1"),
			Optional.empty()
		);
	}

	@PostMapping("/feedback/feature-request")
	public Mono<ProcessOutputResultDto> featureRequest(@RequestBody Map<String, String> request) throws Exception {
		String jobFilePath = request.get("jobFilePath");
		String resolvedPath = Utils.resolvePathAgainstPortableDir(jobFilePath);
		return processService.spawn(
			java.util.Arrays.asList("datapallas.bat", "system", "feature-request", "-f", "\"" + resolvedPath + "\""),
			Optional.empty()
		);
	}

	// ============================================================
	//  Unix CLI + File System
	// ============================================================

	@GetMapping("/fs/find")
	public Mono<List<String>> find(@RequestParam String path, @RequestParam List<String> matching,
			@RequestParam Optional<Boolean> files, @RequestParam Optional<Boolean> directories,
			@RequestParam Optional<Boolean> recursive, @RequestParam Optional<Boolean> ignoreCase) throws Exception {

		String fullPath = Utils.resolvePathAgainstPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		FindCriteriaDto criteriaDto = new FindCriteriaDto(matching, files.orElse(null),
				directories.orElse(null),
				recursive.orElse(null),
				ignoreCase.orElse(null)
		);

		List<String> results = fileSystemService.unixCliFind(fullPath, criteriaDto);

		return Mono.just(results);
	}

	@DeleteMapping("/fs")
	public Mono<Boolean> deleteQuietly(@RequestParam String path) throws Exception {
		String decodedPath = URLDecoder.decode(path, StandardCharsets.UTF_8.toString());
		String fullPath;

		// Normalize path separators for reliable comparison, especially on Windows
		String normalizedDecodedPath = decodedPath.replace("\\", "/");
		String normalizedBaseDirPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH.replace("\\", "/");

		if (normalizedDecodedPath.startsWith(normalizedBaseDirPath)) {
			fullPath = decodedPath;
		} else {
			fullPath = Utils.resolvePathAgainstPortableDir(decodedPath);
		}

		return Mono.just(fileSystemService.fsDelete(fullPath));
	}

	@GetMapping(value = "/fs/content", produces = MediaType.TEXT_PLAIN_VALUE)
	Mono<String> readFileToString(@RequestParam String path) throws Exception {

		String fullPath = Utils.resolvePathAgainstPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		String fileContent = fileSystemService.unixCliCat(fullPath);
		return Mono.just(fileContent);

	}

	@GetMapping("/fs/resolve")
	public Map<String, String> resolveAbsolutePath(@RequestParam("path") String relativePath) {
		String absolutePath = fileSystemService.fsResolvePath(relativePath);
		Map<String, String> result = new HashMap<>();
		result.put("absolutePath", absolutePath);
		return result;
	}

	@PutMapping(value = "/fs/content", consumes = "text/plain")
	Mono<Void> writeStringToFile(@RequestParam String path, @RequestBody Optional<String> content) throws Exception {

		String fullPath = Utils.resolvePathAgainstPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		return Mono.fromRunnable(() -> {
			try {
				fileSystemService.fsWriteStringToFile(fullPath, content);
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		});
	}

	@PostMapping("/fs/copy")
	public Mono<Void> copy(@RequestParam String fromPath, @RequestParam String toPath,
			@RequestParam(defaultValue = "false") boolean overwrite, @RequestParam(required = false) String[] matching,
			@RequestParam(defaultValue = "false") boolean ignoreCase) throws Exception {

		String fullFromPath = Utils.resolvePathAgainstPortableDir(URLDecoder.decode(fromPath, StandardCharsets.UTF_8.toString()));
		String fullToPath = Utils.resolvePathAgainstPortableDir(URLDecoder.decode(toPath, StandardCharsets.UTF_8.toString()));

		return Mono.fromRunnable(() -> {
			try {
				fileSystemService.fsCopy(fullFromPath, fullToPath, overwrite, matching, ignoreCase);
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		});
	}

	@PostMapping("/fs/move")
	public Mono<Void> move(@RequestParam String fromPath, @RequestParam String toPath,
			@RequestParam(defaultValue = "false") boolean overwrite) {

		return Mono.fromRunnable(() -> {
			try {
				fileSystemService.fsMove(Paths.get(URLDecoder.decode(fromPath, StandardCharsets.UTF_8.toString())),
						Paths.get(URLDecoder.decode(toPath, StandardCharsets.UTF_8.toString())), overwrite);
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		});
	}

	@GetMapping(value = "/fs/exists", produces = MediaType.TEXT_PLAIN_VALUE)
	public Mono<String> exists(@RequestParam String path) throws Exception {
		String fullPath = Utils.resolvePathAgainstPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		String exists = fileSystemService.fsExists(fullPath);
		return Mono.just(exists);
	}

	@PostMapping(value = "/fs/dir")
	public Mono<Void> dir(@RequestParam String path, @RequestBody Optional<DirCriteriaDto> criteria) throws Exception {

		String fullPath = Utils.resolvePathAgainstPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		fileSystemService.fsDir(fullPath, criteria);
		return Mono.empty();

	}

	@PostMapping("/fs/file")
	public Mono<String> file(@RequestParam String path, @RequestBody Optional<FileCriteriaDto> criteria)
			throws Exception {

		String file = fileSystemService.fsFile(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()), criteria);
		return Mono.just(file);

	}

	@GetMapping("/fs/inspect")
	public Mono<Optional<InspectResultDto>> inspect(@RequestParam String path, @RequestParam Optional<String> checksum,
			@RequestParam Optional<Boolean> mode, @RequestParam Optional<Boolean> times,
			@RequestParam Optional<Boolean> absolutePath, @RequestParam Optional<String> symlinks) throws Exception {

		Optional<InspectResultDto> inspect = fileSystemService.fsInspect(
				URLDecoder.decode(path, StandardCharsets.UTF_8.toString()), checksum, mode, times, absolutePath,
				symlinks);
		return Mono.just(inspect);

	}

	@GetMapping("/fs/list")
	public Flux<FileInfo> listFiles(@RequestParam String path) throws Exception {
		String fullPath = Utils.resolvePathAgainstPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		List<FileInfo> files = fileSystemService.fsList(fullPath);
		return Flux.fromIterable(files);
	}

}
