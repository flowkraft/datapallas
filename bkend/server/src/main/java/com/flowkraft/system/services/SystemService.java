package com.flowkraft.system.services;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import com.flowkraft.common.AppPaths;
import com.flowkraft.system.dtos.FindCriteriaDto;
import com.flowkraft.system.models.SystemInfo;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettingsInternal;
import com.sourcekraft.documentburster.utils.Utils;

import de.ailis.pherialize.Pherialize;

import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.Marshaller;
import jakarta.xml.bind.Unmarshaller;
import reactor.core.publisher.Mono;

@Service
public class SystemService {

	@Autowired
	private FileSystemService fileSystemService;

	@Autowired
	private DockerService dockerService;

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

	public void saveInternalSettings(DocumentBursterSettingsInternal settings) throws Exception {
		String path = Utils.resolvePathAgainstPortableDir("config/_internal/settings.xml");
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

	public Mono<Map<String, String>> getChangelog(String itemNameDecoded) {
		String url = "https://www.pdfburst.com/store?edd_action=get_version&item_name=" + itemNameDecoded;
		WebClient webClient = WebClient.create();
		return webClient.get().uri(url).exchangeToMono(response -> {
			if (response.statusCode().is3xxRedirection()) {
				String redirectUrl = response.headers().asHttpHeaders().getLocation().toString();
				return webClient.get().uri(redirectUrl).retrieve().bodyToMono(String.class);
			} else {
				return response.bodyToMono(String.class);
			}
		}).map(this::parseChangelogResponse);
	}

	// The licensing server (EDD) returns the changelog inside a PHP-serialized
	// "sections" field. Decode it here and hand the caller plain text so the
	// frontend never has to deal with the PHP-serialize format.
	private Map<String, String> parseChangelogResponse(String rawBody) {
		Map<String, String> result = new HashMap<>();
		result.put("new_version", StringUtils.EMPTY);
		result.put("changelog", StringUtils.EMPTY);

		try {
			JsonNode json = new ObjectMapper().readTree(rawBody);

			if (json.hasNonNull("new_version"))
				result.put("new_version", json.get("new_version").asText());

			if (json.hasNonNull("sections")) {
				String changelog = Pherialize.unserialize(json.get("sections").asText()).toArray()
						.getString("changelog");
				// Flatten the HTML wrapping into plain newlines.
				changelog = changelog.replace("<p>", "\n").replace("</p>", "\n").replace("<br />", "")
						.replace("<br/>", "");
				result.put("changelog", changelog);
			}
		} catch (Exception e) {
			// Leave the empty defaults when the licensing server is unreachable or
			// returns an unexpected payload (expected for demo/offline installations).
		}

		return result;
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
