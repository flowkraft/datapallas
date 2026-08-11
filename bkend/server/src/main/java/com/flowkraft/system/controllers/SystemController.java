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
import org.springframework.security.access.prepost.PreAuthorize;
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
	public Mono<Map<String, String>> getChangelog(@RequestParam String itemName) throws Exception {
		String itemNameDecoded = URLDecoder.decode(itemName, StandardCharsets.UTF_8.toString());
		return systemService.getChangelog(itemNameDecoded);
	}

	/**
	 * The release notes shipped with this installation, for the What's New panel.
	 *
	 * <p>Its own endpoint rather than a filesystem read, because What's New is shown to everyone and
	 * the filesystem API is administrator-only — anything that can read an arbitrary path inside the
	 * installation can read {@code config/_internal/api-key.txt} and become an administrator. This
	 * takes no path at all: there is exactly one CHANGELOG.md and it is the same file for everybody.
	 *
	 * <p>Answers empty rather than failing when the file is absent, which is a thing a user can do —
	 * a missing changelog should hide the panel, not break the screen carrying it.
	 */
	@GetMapping(value = "/info/release-notes", produces = MediaType.TEXT_PLAIN_VALUE)
	public Mono<String> getReleaseNotes() {
		return Mono.just(systemService.readReleaseNotes());
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

	/**
	 * {@code REPORT_AUTHOR}. These are working preferences — theme, the Copilot URL, and whether sample
	 * connections, reports and cubes are shown — and an author is exactly who needs them. Making this
	 * ADMIN put the "Show samples" switch behind a role that could not reach it: the switch lives in
	 * Configuration ▸ More Settings, which authors can open, so they could flip it and watch nothing
	 * happen. An author may already write Groovy that runs on this server; withholding the theme from
	 * them protects nothing.
	 *
	 * <p>They are installation-wide rather than per-person, which is the one thing that argues the other
	 * way — but the field that actually matters if it goes wrong, {@code backendurl}, is now preserved
	 * by {@code saveInternalSettings} and cannot be changed through here by anybody.
	 *
	 * <p>Reading stays open to everyone, because the frontend loads it during startup.
	 */
	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PutMapping(value = "/preferences")
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

	@PreAuthorize("hasRole('ADMIN')")
	@PostMapping("/install/chocolatey")
	public Mono<ProcessOutputResultDto> installChocolatey() throws Exception {
		return processService.installChocolatey();
	}

	@PreAuthorize("hasRole('ADMIN')")
	@PostMapping("/uninstall/chocolatey")
	public Mono<ProcessOutputResultDto> uninstallChocolatey() throws Exception {
		return processService.unInstallChocolatey();
	}

	// ============================================================
	//  Managed Services — local services lifecycle + status
	// ============================================================

	@PreAuthorize("hasRole('JOB_OPERATOR')")
	@PostMapping("/test-email-server/start")
	public Mono<ProcessOutputResultDto> startTestEmailServer() throws Exception {
		return processService.spawn(
			java.util.Arrays.asList("startTestEmailServer.bat"),
			Optional.of("tools/test-email-server")
		);
	}

	@PreAuthorize("hasRole('JOB_OPERATOR')")
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

	/**
	 * Custom-app discovery for the Apps Manager: every _apps/<app>/_custom/app.json
	 * manifest, in ManagedApp shape, with a guaranteed "custom" tag.
	 *
	 * <p>{@code REPORT_AUTHOR}, matching {@code /api/system/services/execute}: the same people who may
	 * start an app are the ones who need to see the list of them.
	 */
	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping("/apps")
	public Mono<List<Map<String, Object>>> getCustomApps() {
		return Mono.fromCallable(() -> systemService.listCustomAppManifests());
	}

	// ============================================================
	//  Application Lifecycle — self-update + feedback
	// ============================================================

	@PreAuthorize("hasRole('ADMIN')")
	@PostMapping("/update/apply")
	public Mono<ProcessOutputResultDto> applyUpdate(@RequestBody Map<String, String> request) throws Exception {
		String jobFilePath = request.get("jobFilePath");
		String resolvedPath = Utils.resolvePathAgainstPortableDir(jobFilePath);
		return processService.spawn(
			java.util.Arrays.asList("rb_rust_updater", "--job_file_path", resolvedPath, "2>&1"),
			Optional.empty()
		);
	}

	/**
	 * Sends a feature request to support: {@code {"subject": "...", "message": "..."}}.
	 *
	 * <p>Open to anyone who can sign in, deliberately. Asking for a feature is not a privileged act,
	 * and the operator running jobs all day is the person who meets the friction first — a feedback
	 * channel that only administrators can reach mostly stops carrying feedback.
	 *
	 * <p>The body is the request itself, not a path to one. It used to be {@code jobFilePath}: the
	 * browser composed the XML, wrote it through the generic filesystem endpoint and passed the name
	 * here. That made a support link depend on write access to the installation, and let a caller
	 * nominate any file in it to be read out and emailed. Now {@link SystemService} writes the file,
	 * names it, and is the only thing that knows where it went.
	 *
	 * <p>A body carrying neither field still answers a {@code ProcessOutputResultDto} rather than an
	 * error status — the CLI is what decides whether an empty request is worth sending, and reporting
	 * its verdict is this endpoint's whole job.
	 */
	@PostMapping("/feedback/feature-request")
	public Mono<ProcessOutputResultDto> featureRequest(@RequestBody Map<String, String> request) throws Exception {
		String jobFilePath = systemService.writeFeatureRequestJobFile(
				request.get("subject"), request.get("message"));

		return processService.spawn(
			java.util.Arrays.asList("datapallas.bat", "system", "feature-request", "-f", "\"" + jobFilePath + "\""),
			Optional.empty()
		);
	}

	// ============================================================
	//  Unix CLI + File System
	// ============================================================
	//
	//  Every endpoint below is REPORT_AUTHOR. Paths are already confined to the installation
	//  directory (Utils.resolveWithinPortableDir), but that confinement only bounds WHERE a caller
	//  can reach — inside the installation sit the connection secrets, the master key and every
	//  exit-point script. Writing a .groovy hook here is equivalent to code execution, and reading
	//  config/_internal/api-key.txt is equivalent to becoming an administrator.
	//
	//  That is why the floor is REPORT_AUTHOR and not lower: an author already writes Groovy,
	//  FreeMarker and JRXML that this server executes unsandboxed, so these endpoints hand them
	//  nothing they could not already take — the report editor genuinely needs them (fs/resolve).
	//  A JOB_OPERATOR cannot execute anything, so for them this WOULD be an escalation, and they
	//  are kept out. Anything an operator legitimately needs gets its own narrow endpoint rather
	//  than a lowered floor here: see /info/release-notes and /feedback/feature-request.
	//

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping("/fs/find")
	public Mono<List<String>> find(@RequestParam String path, @RequestParam List<String> matching,
			@RequestParam Optional<Boolean> files, @RequestParam Optional<Boolean> directories,
			@RequestParam Optional<Boolean> recursive, @RequestParam Optional<Boolean> ignoreCase) throws Exception {

		String fullPath = Utils.resolveWithinPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		FindCriteriaDto criteriaDto = new FindCriteriaDto(matching, files.orElse(null),
				directories.orElse(null),
				recursive.orElse(null),
				ignoreCase.orElse(null)
		);

		List<String> results = fileSystemService.unixCliFind(fullPath, criteriaDto);

		return Mono.just(results);
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@DeleteMapping("/fs")
	public Mono<Boolean> deleteQuietly(@RequestParam String path) throws Exception {
		// resolveWithinPortableDir accepts absolute paths that already point inside the
		// installation directory, so the frontend can keep round-tripping the absolute
		// paths it received from earlier calls.
		String fullPath = Utils.resolveWithinPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		return Mono.just(fileSystemService.fsDelete(fullPath));
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping(value = "/fs/content", produces = MediaType.TEXT_PLAIN_VALUE)
	Mono<String> readFileToString(@RequestParam String path) throws Exception {

		String fullPath = Utils.resolveWithinPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		String fileContent = fileSystemService.unixCliCat(fullPath);
		return Mono.just(fileContent);

	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping("/fs/resolve")
	public Map<String, String> resolveAbsolutePath(@RequestParam("path") String relativePath) {
		String absolutePath = Utils.resolveWithinPortableDir(relativePath);
		Map<String, String> result = new HashMap<>();
		result.put("absolutePath", absolutePath);
		return result;
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PutMapping(value = "/fs/content", consumes = "text/plain")
	Mono<Void> writeStringToFile(@RequestParam String path, @RequestBody Optional<String> content) throws Exception {

		String fullPath = Utils.resolveWithinPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		return Mono.fromRunnable(() -> {
			try {
				fileSystemService.fsWriteStringToFile(fullPath, content);
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		});
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PostMapping("/fs/copy")
	public Mono<Void> copy(@RequestParam String fromPath, @RequestParam String toPath,
			@RequestParam(defaultValue = "false") boolean overwrite, @RequestParam(required = false) String[] matching,
			@RequestParam(defaultValue = "false") boolean ignoreCase) throws Exception {

		String fullFromPath = Utils.resolveWithinPortableDir(URLDecoder.decode(fromPath, StandardCharsets.UTF_8.toString()));
		String fullToPath = Utils.resolveWithinPortableDir(URLDecoder.decode(toPath, StandardCharsets.UTF_8.toString()));

		return Mono.fromRunnable(() -> {
			try {
				fileSystemService.fsCopy(fullFromPath, fullToPath, overwrite, matching, ignoreCase);
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		});
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PostMapping("/fs/move")
	public Mono<Void> move(@RequestParam String fromPath, @RequestParam String toPath,
			@RequestParam(defaultValue = "false") boolean overwrite) throws Exception {

		String fullFromPath = Utils.resolveWithinPortableDir(URLDecoder.decode(fromPath, StandardCharsets.UTF_8.toString()));
		String fullToPath = Utils.resolveWithinPortableDir(URLDecoder.decode(toPath, StandardCharsets.UTF_8.toString()));

		return Mono.fromRunnable(() -> {
			try {
				fileSystemService.fsMove(Paths.get(fullFromPath), Paths.get(fullToPath), overwrite);
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		});
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping(value = "/fs/exists", produces = MediaType.TEXT_PLAIN_VALUE)
	public Mono<String> exists(@RequestParam String path) throws Exception {
		String fullPath = Utils.resolveWithinPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		String exists = fileSystemService.fsExists(fullPath);
		return Mono.just(exists);
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PostMapping(value = "/fs/dir")
	public Mono<Void> dir(@RequestParam String path, @RequestBody Optional<DirCriteriaDto> criteria) throws Exception {

		String fullPath = Utils.resolveWithinPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		fileSystemService.fsDir(fullPath, criteria);
		return Mono.empty();

	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PostMapping("/fs/file")
	public Mono<String> file(@RequestParam String path, @RequestBody Optional<FileCriteriaDto> criteria)
			throws Exception {

		String file = fileSystemService.fsFile(
				Utils.resolveWithinPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString())), criteria);
		return Mono.just(file);

	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping("/fs/inspect")
	public Mono<Optional<InspectResultDto>> inspect(@RequestParam String path, @RequestParam Optional<String> checksum,
			@RequestParam Optional<Boolean> mode, @RequestParam Optional<Boolean> times,
			@RequestParam Optional<Boolean> absolutePath, @RequestParam Optional<String> symlinks) throws Exception {

		Optional<InspectResultDto> inspect = fileSystemService.fsInspect(
				Utils.resolveWithinPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString())), checksum,
				mode, times, absolutePath, symlinks);
		return Mono.just(inspect);

	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping("/fs/list")
	public Flux<FileInfo> listFiles(@RequestParam String path) throws Exception {
		String fullPath = Utils.resolveWithinPortableDir(URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		List<FileInfo> files = fileSystemService.fsList(fullPath);
		return Flux.fromIterable(files);
	}

}
