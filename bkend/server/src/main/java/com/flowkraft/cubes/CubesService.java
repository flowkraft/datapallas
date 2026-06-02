package com.flowkraft.cubes;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.flowkraft.common.AppPaths;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.sourcekraft.documentburster.utils.Utils;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;
import com.sourcekraft.documentburster.common.settings.Settings;

/**
 * Service for managing cube definition files.
 *
 * File structure:
 *   config/cubes/{cubeId}/
 *     {cubeId}-cube-config.groovy   (DSL code)
 *     cube.xml                       (metadata: name, description, connectionId)
 *
 * Naming convention follows existing DSL pattern:
 *   g-dashboard-tabulator-config.groovy → {cubeId}-cube-config.groovy
 */
@Service
public class CubesService {

	private static final Logger log = LoggerFactory.getLogger(CubesService.class);

	private String getCubesDir() {
		return Utils.resolvePathAgainstPortableDir("config/cubes");
	}

	private String getSamplesCubesDir() {
		return Utils.resolvePathAgainstPortableDir("config/samples-cubes");
	}

	private String getCubeDir(String cubeId) {
		return getCubesDir() + "/" + cubeId;
	}

	private String getSampleCubeDir(String cubeId) {
		return getSamplesCubesDir() + "/" + cubeId;
	}

	private String getDslPath(String cubeId) {
		return getCubeDir(cubeId) + "/" + cubeId + "-cube-config.groovy";
	}

	private String getMetadataPath(String cubeId) {
		return getCubeDir(cubeId) + "/cube.xml";
	}

	/** Returns true if the given cube ID is a bundled sample (read-only). */
	public boolean isSampleCube(String cubeId) {
		File f = new File(getSampleCubeDir(cubeId));
		return f.exists() && f.isDirectory();
	}

	/**
	 * Resolve the on-disk directory for a cube ID.
	 * Looks first in config/cubes (user-owned), then in config/samples-cubes (read-only samples).
	 */
	private File resolveCubeDir(String cubeId) {
		File userDir = new File(getCubeDir(cubeId));
		if (userDir.exists()) return userDir;
		File sampleDir = new File(getSampleCubeDir(cubeId));
		if (sampleDir.exists()) return sampleDir;
		return userDir; // default to user dir for not-yet-existing cubes (used by save())
	}

	/**
	 * List all cube definitions.
	 * Returns a list of maps with id, name, description, connectionId, isSample.
	 * Sample cubes (under config/samples-cubes/) are only included when the
	 * showsamples user preference is enabled.
	 */
	public List<Map<String, String>> listAll() throws IOException {
		List<Map<String, String>> cubes = new ArrayList<>();

		// Always scan user cubes
		scanCubesDir(new File(getCubesDir()), false, cubes);

		// Optionally scan sample cubes
		if (Settings.isShowSamplesEnabled()) {
			scanCubesDir(new File(getSamplesCubesDir()), true, cubes);
		}

		return cubes;
	}

	private void scanCubesDir(File cubesDir, boolean isSample, List<Map<String, String>> out) throws IOException {
		if (!cubesDir.exists() || !cubesDir.isDirectory()) {
			return;
		}

		File[] dirs = cubesDir.listFiles(File::isDirectory);
		if (dirs == null) return;

		for (File dir : dirs) {
			String cubeId = dir.getName();
			File metaFile = new File(dir, "cube.xml");
			Map<String, String> info = new LinkedHashMap<>();
			info.put("id", cubeId);

			if (metaFile.exists()) {
				String xml = Files.readString(metaFile.toPath());
				info.put("name", extractXmlValue(xml, "name", cubeId));
				info.put("description", extractXmlValue(xml, "description", ""));
				info.put("connectionId", extractXmlValue(xml, "connectionId", ""));
			} else {
				info.put("name", cubeId);
				info.put("description", "");
				info.put("connectionId", "");
			}

			info.put("isSample", isSample ? "true" : "false");

			out.add(info);
		}
	}

	/**
	 * Load a cube definition (metadata + DSL code).
	 * Looks first under config/cubes (user-owned), then config/samples-cubes (read-only).
	 */
	public Map<String, Object> load(String cubeId) throws IOException {
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("id", cubeId);

		File cubeDir = resolveCubeDir(cubeId);
		boolean isSample = isSampleCube(cubeId) && !new File(getCubeDir(cubeId)).exists();

		File metaFile = new File(cubeDir, "cube.xml");
		if (metaFile.exists()) {
			String xml = Files.readString(metaFile.toPath());
			result.put("name", extractXmlValue(xml, "name", cubeId));
			result.put("description", extractXmlValue(xml, "description", ""));
			result.put("connectionId", extractXmlValue(xml, "connectionId", ""));
		} else {
			result.put("name", cubeId);
			result.put("description", "");
			result.put("connectionId", "");
		}

		File dslFile = new File(cubeDir, cubeId + "-cube-config.groovy");
		if (dslFile.exists()) {
			result.put("dslCode", Files.readString(dslFile.toPath()));
		} else {
			result.put("dslCode", "");
		}

		result.put("isSample", isSample);

		return result;
	}

	/**
	 * Save a cube definition (metadata + DSL code).
	 * Refuses to save sample cubes (read-only).
	 */
	public void save(String cubeId, String name, String description, String connectionId, String dslCode)
			throws IOException {
		if (isSampleCube(cubeId) && !new File(getCubeDir(cubeId)).exists()) {
			throw new IllegalArgumentException("Sample cube '" + cubeId + "' is read-only");
		}
		File cubeDir = new File(getCubeDir(cubeId));
		if (!cubeDir.exists()) {
			cubeDir.mkdirs();
		}

		// Save metadata as simple XML
		String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
				+ "<cube>\n"
				+ "    <name>" + escapeXml(name) + "</name>\n"
				+ "    <description>" + escapeXml(description) + "</description>\n"
				+ "    <connectionId>" + escapeXml(connectionId) + "</connectionId>\n"
				+ "</cube>\n";
		Files.writeString(Path.of(getMetadataPath(cubeId)), xml);

		// Save DSL code as plain groovy file
		Files.writeString(Path.of(getDslPath(cubeId)), dslCode != null ? dslCode : "");

		log.info("Saved cube definition: {}", cubeId);
	}

	/**
	 * Create a new cube definition with defaults.
	 */
	public Map<String, Object> create(String cubeId, String name) throws IOException {
		if (StringUtils.isBlank(cubeId)) {
			throw new IllegalArgumentException("cubeId is required");
		}
		if (isSampleCube(cubeId)) {
			throw new IllegalArgumentException("Cube ID '" + cubeId + "' conflicts with a bundled sample cube");
		}
		File cubeDir = new File(getCubeDir(cubeId));
		if (cubeDir.exists()) {
			throw new IllegalArgumentException("Cube '" + cubeId + "' already exists");
		}

		String defaultDsl = "cube {\n"
				+ "  sql_table 'table_name'\n"
				+ "  title '" + escapeXml(name) + "'\n"
				+ "\n"
				+ "  dimension { name 'id'; sql 'id'; type 'number'; primary_key true }\n"
				+ "\n"
				+ "  measure { name 'count'; type 'count' }\n"
				+ "}";

		save(cubeId, name, "", "", defaultDsl);
		return load(cubeId);
	}

	/**
	 * Delete a cube definition. Refuses to delete sample cubes (read-only).
	 */
	public void delete(String cubeId) throws IOException {
		if (isSampleCube(cubeId) && !new File(getCubeDir(cubeId)).exists()) {
			throw new IllegalArgumentException("Sample cube '" + cubeId + "' is read-only");
		}
		File cubeDir = new File(getCubeDir(cubeId));
		if (cubeDir.exists()) {
			FileUtils.deleteDirectory(cubeDir);
			log.info("Deleted cube definition: {}", cubeId);
		}
	}

	/**
	 * Duplicate a cube definition.
	 */
	public Map<String, Object> duplicate(String sourceId, String targetId, String targetName) throws IOException {
		Map<String, Object> source = load(sourceId);
		save(targetId, targetName,
				(String) source.get("description"),
				(String) source.get("connectionId"),
				(String) source.get("dslCode"));
		return load(targetId);
	}

	/**
	 * Parse DSL code and return structured CubeOptions.
	 */
	public CubeOptions parseDsl(String dslCode) throws Exception {
		return CubeOptionsParser.parseGroovyCubeDslCode(dslCode);
	}

	// ── Helpers ──

	private static String extractXmlValue(String xml, String tag, String defaultValue) {
		int start = xml.indexOf("<" + tag + ">");
		int end = xml.indexOf("</" + tag + ">");
		if (start >= 0 && end > start) {
			return xml.substring(start + tag.length() + 2, end);
		}
		return defaultValue;
	}

	private static String escapeXml(String s) {
		if (s == null) return "";
		return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
				.replace("\"", "&quot;").replace("'", "&apos;");
	}
}
