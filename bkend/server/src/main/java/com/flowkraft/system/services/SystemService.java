package com.flowkraft.system.services;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import com.flowkraft.common.AppPaths;
import com.flowkraft.system.dtos.FindCriteriaDto;
import com.flowkraft.system.models.SystemInfo;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettingsInternal;
import com.sourcekraft.documentburster.utils.LicenseUtils;
import com.sourcekraft.documentburster.utils.Utils;


import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.Marshaller;
import jakarta.xml.bind.Unmarshaller;
import reactor.core.publisher.Mono;

@Service
public class SystemService {

	private static final Logger log = LoggerFactory.getLogger(SystemService.class);

	@Autowired
	private FileSystemService fileSystemService;

	@Autowired
	private DockerService dockerService;

	/**
	 * Custom-app discovery: list every _apps/<app>/_custom/app.json manifest.
	 * The manifest shape mirrors the frontend ManagedApp interface and is returned
	 * verbatim, except that a "custom-app" tag is guaranteed on every app so the
	 * Apps Manager tag filter (and the "View Custom Apps" link + Custom App badge)
	 * can group them.
	 */
	public List<Map<String, Object>> listCustomAppManifests() {
		List<Map<String, Object>> manifests = new ArrayList<>();
		// Direct children of _apps/ (user apps) + FlowKraft example apps under _apps/flowkraft/_examples/.
		ObjectMapper mapper = new ObjectMapper();
		for (File appDir : Utils.getCustomAppDirs()) {
			File manifestFile = new File(new File(appDir, "_custom"), "app.json");
			if (!manifestFile.isFile())
				continue;
			try {
				Map<String, Object> manifest = mapper.readValue(manifestFile,
						new TypeReference<Map<String, Object>>() {
						});
				List<Object> tags = new ArrayList<>();
				if (manifest.get("tags") instanceof List)
					tags.addAll((List<?>) manifest.get("tags"));
				if (!tags.contains("custom-app"))
					tags.add("custom-app");
				manifest.put("tags", tags);
				manifests.add(manifest);
			} catch (Exception e) {
				log.warn("Skipping unparseable custom app manifest {}: {}", manifestFile, e.getMessage());
			}
		}
		return manifests;
	}

	public SystemInfo getSystemInfo() throws Exception {
		// Ensure Docker cache is fresh before returning status to the caller.
		dockerService.refreshDockerIfStale(false, false);

		SystemInfo info = new SystemInfo();
		info.osName = System.getProperty("os.name");
		info.osVersion = System.getProperty("os.version");
		info.userName = System.getProperty("user.name");
		info.osArch = System.getProperty("os.arch");
		info.product = "DataPallas";

		List<String> matching = new ArrayList<String>();

		matching.add("startServer.*");
		Optional<Boolean> files = Optional.of(true);
		Optional<Boolean> directories = Optional.of(false);
		Optional<Boolean> recursive = Optional.of(false);
		Optional<Boolean> ignoreCase = Optional.of(false);

		FindCriteriaDto criteria = new FindCriteriaDto(matching, files.orElse(null),
				directories.orElse(null),
				recursive.orElse(null),
				ignoreCase.orElse(null));

		List<String> startServerScripts = fileSystemService.unixCliFind(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, criteria);
		if (!Objects.isNull(startServerScripts) && startServerScripts.size() > 0)
			info.product = "DataPallas Server";

		// Use cached Docker probe results
		info.isDockerDaemonRunning = dockerService.isCachedDockerDaemonRunning();
		info.dockerVersion = dockerService.getCachedDockerVersion();
		info.isDockerInstalled = !"DOCKER_NOT_INSTALLED".equals(dockerService.getCachedDockerVersion())
			&& !"DOCKER_NOT_CHECKED".equals(dockerService.getCachedDockerVersion());
		info.isChocoOk = false;
		info.chocoVersion = "CHOCO_NOT_CHECKED_YET";

		return info;

	}

	public DocumentBursterSettingsInternal loadInternalSettings() throws Exception {
		String path = Utils.resolvePathAgainstPortableDir("config/_internal/settings.xml");
		JAXBContext jc = JAXBContext.newInstance(DocumentBursterSettingsInternal.class);
		Unmarshaller u = jc.createUnmarshaller();
		try (FileInputStream fis = new FileInputStream(path)) {
			return (DocumentBursterSettingsInternal) u.unmarshal(fis);
		}
	}

	/**
	 * Saves the preferences a user can actually change — and keeps {@code backendurl} out of their
	 * reach.
	 *
	 * <p>{@code backendurl} is not a preference. The packaged desktop app reads it straight out of this
	 * file to learn where its own backend lives, so a wrong value there is not a wrong setting: every
	 * request goes to a path that does not exist, the whole application answers 401, and the login
	 * screen never appears because the identity probe fails along with everything else. The app cannot
	 * repair it either — fixing it needs the backend it can no longer reach.
	 *
	 * <p>It reached this method at all because the frontend ships a default preferences object that
	 * carries its own copy of the field. When a load fails, that default survives, and the next theme
	 * change marshals it back over the real one. Rather than trusting every caller to send the field
	 * back untouched, the stored value simply wins: a client that omits it, or invents one, changes
	 * nothing.
	 */
	public void saveInternalSettings(DocumentBursterSettingsInternal settings) throws Exception {
		String path = Utils.resolvePathAgainstPortableDir("config/_internal/settings.xml");

		if (settings != null && settings.settings != null) {
			try {
				DocumentBursterSettingsInternal stored = loadInternalSettings();
				if (stored != null && stored.settings != null
						&& StringUtils.isNotBlank(stored.settings.backendurl)) {
					settings.settings.backendurl = stored.settings.backendurl;
				}
			} catch (Exception e) {
				// No readable file yet (first run) — nothing to preserve, and refusing to save the
				// user's theme because of it would be worse than the thing being guarded against.
				log.debug("Could not read the stored internal settings to preserve backendurl: {}",
						e.getMessage());
			}
		}

		File f = new File(path);
		f.getParentFile().mkdirs();
		JAXBContext jc = JAXBContext.newInstance(DocumentBursterSettingsInternal.class);
		Marshaller m = jc.createMarshaller();
		m.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);
		try (OutputStream os = new FileOutputStream(f)) {
			m.marshal(settings, os);
		}
		Settings.invalidateShowSamplesCache();
	}

	/**
	 * Writes the XML job file the {@code system feature-request} CLI command reads, and answers where
	 * it put it.
	 *
	 * <p>Here rather than in the browser. The frontend used to compose this XML itself, PUT it through
	 * the generic filesystem endpoint, and then hand the backend the path to send — which meant the
	 * "Request a feature" link in the top bar could only work for someone allowed to write arbitrary
	 * files inside the installation, and meant a caller got to nominate which file the mailer read.
	 * Neither is anything to do with asking for a feature. The subject and the message are the whole
	 * request; the file is an implementation detail of the CLI and belongs on this side of the wire.
	 *
	 * <p>The name is generated here too, so no caller can choose or predict it.
	 */
	public String writeFeatureRequestJobFile(String subject, String message) throws Exception {

		Path jobsDir = Paths.get(Utils.resolvePathAgainstPortableDir("temp"));
		Files.createDirectories(jobsDir);

		Path jobFile = jobsDir.resolve("feature-request-" + UUID.randomUUID() + ".xml");

		String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
				+ "<documentburster>\n"
				+ "    <featurerequest>\n"
				+ "        <subject>" + escapeXml(subject) + "</subject>\n"
				+ "        <message>" + escapeXml(message) + "</message>\n"
				+ "    </featurerequest>\n"
				+ "</documentburster>";

		Files.write(jobFile, xml.getBytes(StandardCharsets.UTF_8));

		return jobFile.toString();
	}

	/**
	 * The five predefined XML entities, applied to text that a user typed.
	 *
	 * <p>Without this an ampersand in a message produces a file the CLI cannot parse, and a
	 * {@code </featurerequest>} typed into the box would end the element early.
	 */
	private static String escapeXml(String value) {
		if (value == null)
			return "";
		return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
				.replace("\"", "&quot;").replace("'", "&apos;");
	}

	public Mono<Boolean> checkUrl(String decodedUrl) {
		WebClient webClient = WebClient.create();
		return webClient.get().uri(decodedUrl).exchangeToMono(response -> {
			if (response.statusCode().equals(HttpStatus.OK)) {
				return Mono.just(true);
			} else {
				return Mono.just(false);
			}
		}).onErrorResume(e -> Mono.just(false));
	}

	/**
	 * CHANGELOG.md as it shipped, from the installation directory.
	 *
	 * <p>Takes no path: there is one changelog and it is the same for every caller, which is exactly
	 * what lets this be readable by anyone while the path-taking filesystem API stays administrator-only.
	 *
	 * <p>An unreadable or absent file answers empty. Users do delete it, and the What's New panel
	 * already treats empty as "nothing to show" — failing here would break every screen that hosts it.
	 */
	public String readReleaseNotes() {

		File changelog = new File(Utils.resolvePathAgainstPortableDir("CHANGELOG.md"));

		try {
			return changelog.isFile() ? FileUtils.readFileToString(changelog, StandardCharsets.UTF_8)
					: StringUtils.EMPTY;
		} catch (Exception e) {
			log.warn("Could not read CHANGELOG.md", e);
			return StringUtils.EMPTY;
		}
	}

	/**
	 * The latest release and its notes — what the What's New panel and the update-available badge read.
	 *
	 * <p>Keyless, so a demo installation with no licence is told about a new version too. That is the
	 * person most worth reaching.
	 */
	public Mono<Map<String, String>> getChangelog(String itemNameDecoded) {

		// Through LicenseUtils, the one place that talks to datapallas.com. Its transport tries the
		// bundled curl before the in-JVM client, because the JVM's own TLS stack is what failed
		// against that host in the field. A second HTTP client here would reintroduce that failure.
		//
		// The product is no longer named by the caller: LicenseUtils derives it from the installation,
		// which is the only answer that can be right — an installation knows which edition it is far
		// better than a query string does.
		Map<String, String> result = new HashMap<>();
		result.put("new_version", StringUtils.EMPTY);
		result.put("changelog", StringUtils.EMPTY);

		try {
			JsonNode release = new LicenseUtils().fetchLatestRelease();
			result.put("new_version", release.path("version").asText(StringUtils.EMPTY));
			result.put("changelog", release.path("changelog").asText(StringUtils.EMPTY));

		} catch (Exception e) {
			// Expected on a machine with no connectivity. The badge simply says nothing.
			log.debug("Could not read the latest release information: {}", e.getMessage());
		}

		return Mono.just(result);
	}



	public Mono<String> getBlogPosts() {
		String url = "https://www.pdfburst.com/blog/feed/";
		WebClient webClient = WebClient.create();
		return webClient.get().uri(url).retrieve().bodyToMono(String.class).flatMap(body -> {
			XmlMapper xmlMapper = new XmlMapper();
			ObjectMapper jsonMapper = new ObjectMapper();
			return Mono.fromCallable(() -> xmlMapper.readTree(body))
					.flatMap(xmlNode -> Mono.fromCallable(() -> jsonMapper.writeValueAsString(xmlNode)));
		}).onErrorMap(e -> new RuntimeException("Error converting XML to JSON", e));
	}

	public Mono<String> getCopilotUrl() {
		return Mono.fromCallable(() -> {
			DocumentBursterSettingsInternal internal = loadInternalSettings();
			if (internal != null && internal.settings != null
					&& !StringUtils.isBlank(internal.settings.copiloturl)) {
				return internal.settings.copiloturl;
			}
			return "https://chatgpt.com/";
		});
	}

}
