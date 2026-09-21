package com.flowkraft.system.services;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.concurrent.TimeUnit;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.zeroturnaround.exec.ProcessExecutor;
import org.zeroturnaround.exec.ProcessResult;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.common.AppPaths;
import com.flowkraft.common.Constants;
import com.sourcekraft.documentburster.common.ServicesManager;

import java.util.Map;

@Service
public class DockerService {

	private static final Logger log = LoggerFactory.getLogger(DockerService.class);

	// Cached availability/version information
	private volatile boolean cachedDockerDaemonRunning = false;
	private volatile boolean cachedDockerOk = false;
	private volatile String cachedDockerVersion = "DOCKER_NOT_CHECKED";

	// TTL-based caching for Docker probe
	private static final long DOCKER_PROBE_TTL_MS = 15_000;
	private volatile long lastDockerProbeTimeMs = 0L;

	private volatile String dockerHostOverride = null;
	private static final String DOCKER_ENGINE_PIPE = "npipe:////./pipe/docker_engine";

	// Inner public class for service status info
	public static class ServiceStatusInfo {
		public String name;
		public String status;
		public String ports;
		public String health;
		/**
		 * The container belongs to a Compose project outside this installation, so it is not one of our apps
		 * even when its name looks like one. Without this, another CloudBeaver on the same machine
		 * ("ints-cloudbeaver") made the Apps screen show CloudBeaver as running — and Stop would have stopped
		 * a stranger's container (plan §4 D6).
		 */
		public boolean foreign;
	}

	/**
	 * Whether a container was started by Compose from somewhere other than this installation's _apps folder.
	 * Containers with no Compose labels (started by hand) and containers whose project files live under the
	 * installation are ours; when the installation directory is unknown, nothing is treated as foreign.
	 */
	static boolean isForeignComposeContainer(String labels, String installationDir) {
		if (labels == null || labels.isEmpty() || installationDir == null || installationDir.isEmpty())
			return false;

		String configFiles = null;
		for (String label : labels.split(",")) {
			String[] pair = label.split("=", 2);
			if (pair.length == 2 && "com.docker.compose.project.config_files".equals(pair[0].trim())) {
				configFiles = pair[1].trim();
				break;
			}
		}
		if (configFiles == null || configFiles.isEmpty())
			return false;

		String appsDir = (installationDir.replace("\\", "/") + "/_apps").toLowerCase();
		for (String configFile : configFiles.split(",")) {
			if (configFile.replace("\\", "/").toLowerCase().startsWith(appsDir))
				return false;
		}
		return true;
	}

	/**
	 * Execute a Docker daemon command with automatic fallback on Windows.
	 */
	private ProcessResult executeDockerDaemonCommand(List<String> dockerArgs, int timeoutSeconds) throws Exception {
		List<String> cmd = new ArrayList<>();
		cmd.add("docker");
		if (dockerHostOverride != null) {
			cmd.add("-H");
			cmd.add(dockerHostOverride);
		}
		cmd.addAll(dockerArgs);

		ProcessResult result = new ProcessExecutor().command(cmd)
				.readOutput(true).redirectErrorStream(true)
				.timeout(timeoutSeconds, TimeUnit.SECONDS)
				.execute();

		if (result.getExitValue() != 0
				&& dockerHostOverride == null
				&& result.getOutput().getString().contains("Access is denied")
				&& System.getProperty("os.name").toLowerCase().contains("win")) {

			log.info("Docker pipe access denied, retrying with standard docker_engine pipe");
			List<String> fallbackCmd = new ArrayList<>();
			fallbackCmd.add("docker");
			fallbackCmd.add("-H");
			fallbackCmd.add(DOCKER_ENGINE_PIPE);
			fallbackCmd.addAll(dockerArgs);

			result = new ProcessExecutor().command(fallbackCmd)
					.readOutput(true).redirectErrorStream(true)
					.timeout(timeoutSeconds, TimeUnit.SECONDS)
					.execute();

			if (result.getExitValue() == 0 || result.getOutput().getString().contains("Server:")) {
				dockerHostOverride = DOCKER_ENGINE_PIPE;
				log.info("Docker fallback to docker_engine pipe succeeded, caching for future calls");
			}
		}

		return result;
	}

	/**
	 * Synchronously refresh Docker presence/version and daemon status.
	 */
	public synchronized void refreshChocoAndDockerSync() {
		String prevVersion = cachedDockerVersion;
		boolean prevDaemonRunning = cachedDockerDaemonRunning;
		boolean prevOk = cachedDockerOk;

		String newDockerVersion = cachedDockerVersion;
		boolean newDockerDaemonRunning = cachedDockerDaemonRunning;

		try {
			ProcessResult pr = new ProcessExecutor().command("docker", "--version").readOutput(true)
					.redirectErrorStream(true)
					.timeout(3, TimeUnit.SECONDS)
					.execute();
			if (pr.getExitValue() == 0) {
				String out = pr.getOutput().getString();
				java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d+(?:\\.\\d+)+)").matcher(out);
				newDockerVersion = m.find() ? m.group(1) : out.trim();
			} else {
				newDockerVersion = "DOCKER_NOT_INSTALLED";
			}
		} catch (Exception e) {
			newDockerVersion = "DOCKER_NOT_INSTALLED";
		}

		try {
			if (!"DOCKER_NOT_INSTALLED".equals(newDockerVersion)) {
				ProcessResult pr2 = executeDockerDaemonCommand(Arrays.asList("version"), 30);
				int exitVal = pr2.getExitValue();
				String output = pr2.getOutput().getString().trim();

				boolean outputHasServer = output.contains("Server:");
				newDockerDaemonRunning = (exitVal == 0) || outputHasServer;

				if (exitVal == 0) {
					log.debug("docker version check passed (exit code: 0)");
				} else if (outputHasServer) {
					log.info("docker version exit code {} but output contains Server info — daemon is running", exitVal);
				} else {
					log.warn("docker version check failed (exit code: {}, no Server info in output)", exitVal);
					log.warn("docker version output/error: {}", output);
				}
			} else {
				newDockerDaemonRunning = false;
			}
		} catch (Exception e) {
			log.warn("docker version check failed with exception: {}", e.getMessage());
			newDockerDaemonRunning = false;
		}

		boolean newOk = (!"DOCKER_NOT_INSTALLED".equals(newDockerVersion)) && newDockerDaemonRunning;

		if (!Objects.equals(prevVersion, newDockerVersion) || prevDaemonRunning != newDockerDaemonRunning
				|| prevOk != newOk) {
			log.debug(
					"refreshChocoAndDockerSync: docker status changed: version {}->{}, daemon {}->{}, ok {}->{}",
					prevVersion, newDockerVersion, prevDaemonRunning, newDockerDaemonRunning, prevOk, newOk);
		}

		cachedDockerVersion = newDockerVersion;
		cachedDockerDaemonRunning = newDockerDaemonRunning;
		cachedDockerOk = newOk;

		lastDockerProbeTimeMs = System.currentTimeMillis();
	}

	/**
	 * Refresh Docker probe if TTL expired or if forced.
	 */
	public synchronized void refreshDockerIfStale(boolean force, boolean skipProbe) {
		if (skipProbe) {
			return;
		}
		long now = System.currentTimeMillis();
		if (!force && (now - lastDockerProbeTimeMs) < DOCKER_PROBE_TTL_MS) {
			return;
		}
		refreshChocoAndDockerSync();
	}

	public String getDockerVersion() {
		try {
			ProcessResult r = new ProcessExecutor().command("docker", "--version").readOutput(true)
					.redirectErrorStream(true)
					.timeout(3, TimeUnit.SECONDS)
					.execute();
			if (r.getExitValue() != 0)
				return "";
			String out = r.getOutput().getString();
			java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d+(?:\\.\\d+)+)").matcher(out);
			if (m.find())
				return m.group(1);
			return out.trim();
		} catch (Exception e) {
			return "";
		}
	}

	public boolean isCachedDockerDaemonRunning() {
		return cachedDockerDaemonRunning;
	}

	public String getCachedDockerVersion() {
		return cachedDockerVersion;
	}

	public List<ServiceStatusInfo> getAllServicesStatus(boolean forceProbe, boolean skipProbe) throws Exception {

		List<ServiceStatusInfo> statuses = new ArrayList<>();
		try {
			refreshDockerIfStale(forceProbe, skipProbe);
			if ("DOCKER_NOT_INSTALLED".equals(this.cachedDockerVersion)) {
				log.warn("Docker CLI not installed (cached) - skipping getAllServicesStatus");
				return statuses;
			}
			if (!this.cachedDockerDaemonRunning) {
				log.warn("Docker CLI present but daemon not running (cached) - skipping getAllServicesStatus");
				return statuses;
			}

			ProcessResult result = executeDockerDaemonCommand(
					Arrays.asList("ps", "--format", "json"), 5);
			String output = result.getOutput().getString();

			if (result.getExitValue() != 0) {
				log.warn("Docker command failed (exit code={}): {}", result.getExitValue(), output);
				return statuses;
			}

			output = output.trim();
			if (output.isEmpty()) {
				return statuses;
			}

			ObjectMapper mapper = new ObjectMapper();

			if (output.startsWith("[")) {
				List<Map<String, Object>> services = mapper.readValue(output,
						new TypeReference<List<Map<String, Object>>>() {
						});
				for (Map<String, Object> service : services) {
					ServiceStatusInfo info = new ServiceStatusInfo();
					info.name = (String) service.get("Names");
					String state = (String) service.get("State");
					String statusText = (String) service.get("Status");
					info.health = extractHealthStatus(statusText);
					if ("running".equals(state) && info.health != null && !"healthy".equals(info.health)) {
						info.status = "starting";
					} else {
						info.status = state;
					}
					info.ports = service.get("Ports") != null ? service.get("Ports").toString() : "N/A";
					info.foreign = isForeignComposeContainer((String) service.get("Labels"),
							AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);
					statuses.add(info);
				}
			} else if (output.startsWith("{")) {
				String[] lines = output.split("\\R");
				for (String line : lines) {
					line = line.trim();
					if (line.isEmpty() || !line.startsWith("{")) {
						continue;
					}
					try {
						Map<String, Object> service = mapper.readValue(line, new TypeReference<Map<String, Object>>() {
						});
						if (service.containsKey("Names")) {
							ServiceStatusInfo info = new ServiceStatusInfo();
							info.name = (String) service.get("Names");
							String state = (String) service.get("State");
							String statusText = (String) service.get("Status");
							info.health = extractHealthStatus(statusText);
							if ("running".equals(state) && info.health != null && !"healthy".equals(info.health)) {
								info.status = "starting";
							} else {
								info.status = state;
							}
							info.ports = service.get("Ports") != null ? service.get("Ports").toString() : "N/A";
							info.foreign = isForeignComposeContainer((String) service.get("Labels"),
									AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);
							statuses.add(info);
						}
					} catch (Exception e) {
						log.debug("Failed to parse Docker JSON line (ignored): {}", line);
					}
				}
			} else {
				log.warn("Non-JSON output from Docker (ignored): {}", output);
			}
		} catch (Exception e) {
			log.warn("Exception while fetching Docker services status: {}", e.getMessage());
			return statuses;
		} finally {
			try {
				processPauseCancelJobs();
			} catch (Exception e) {
				log.debug("processPauseCancelJobs failed (ignored): {}", e.getMessage());
			}
		}

		return statuses;
	}

	/**
	 * Extract health status from Docker's Status string.
	 */
	private String extractHealthStatus(String statusText) {
		if (statusText == null)
			return null;
		if (statusText.contains("(healthy)"))
			return "healthy";
		if (statusText.contains("(health: starting)"))
			return "starting";
		if (statusText.contains("(unhealthy)"))
			return "unhealthy";
		return null;
	}

	/**
	 * Scan the jobs temp folder for *.pause / *.cancel files and handle them.
	 */
	private void processPauseCancelJobs() throws Exception {
		Path jobsDir = Paths.get(AppPaths.JOBS_DIR_PATH);
		if (!Files.exists(jobsDir) || !Files.isDirectory(jobsDir))
			return;

		List<Path> files = Files.list(jobsDir).collect(Collectors.toList());

		for (Path p : files) {
			String fname = p.getFileName().toString();
			if (!(fname.endsWith(".pause") || fname.endsWith(".cancel")))
				continue;

			String baseName = FilenameUtils.getBaseName(fname);
			String jobFileName = baseName + Constants.EXTENTION_JOB_FILE;
			Path jobPath = jobsDir.resolve(jobFileName);
			if (!Files.exists(jobPath)) {
				continue;
			}

			String jobContent = Files.readString(jobPath, StandardCharsets.UTF_8);
			Pattern jobtypePtn = Pattern.compile("<jobtype>(.*?)</jobtype>", Pattern.DOTALL);
			Matcher jobtypeMatcher = jobtypePtn.matcher(jobContent);
			if (!jobtypeMatcher.find()) {
				continue;
			}
			String jobtype = jobtypeMatcher.group(1).trim();
			String[] tokens = jobtype.split("\\s+");
			if (tokens.length < 3 || !tokens[0].equalsIgnoreCase("app") || !tokens[1].equalsIgnoreCase("start")) {
				continue;
			}
			String serviceName = tokens[2].trim();

			try {
				ServicesManager.Result r = ServicesManager.execute("app stop " + serviceName);
				String status = (r != null ? r.status : "null");
				String outputStr = (r != null && r.output != null ? r.output.replaceAll("\r?\n", " ") : "");
				// System.out.println("pause/cancel: executed 'app stop " + serviceName + "' -> status=" + status
				// 		+ " output=" + outputStr);

				if ("stopped".equalsIgnoreCase(status) || "ok".equalsIgnoreCase(status)) {
					FileUtils.deleteQuietly(jobPath.toFile());
					FileUtils.deleteQuietly(p.toFile());
					FileUtils.deleteQuietly(jobsDir.resolve(baseName + ".progress").toFile());
					// System.out.println("pause/cancel: cleaned up job files for " + baseName);
				} else {
					// System.err.println("pause/cancel: stop command did not indicate success for " + serviceName
					// 		+ " (status=" + status + "). Leaving signal file for retry.");
				}
			} catch (Exception ex) {
				System.err.println(
						"pause/cancel: Exception while executing stop for " + serviceName + ": " + ex.getMessage());
			}
		}

	}

}
