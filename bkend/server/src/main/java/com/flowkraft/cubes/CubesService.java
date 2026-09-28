package com.flowkraft.cubes;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.limits.LimitsSandbox;
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
 * The read-only samples under config/samples-cubes are grouped one folder per domain (northwind,
 * crm-sales, erp-finance, ...), several cubes to a folder and, when a DSL file holds more than one
 * cube, several cubes to a file. {@link CubeFiles} says where each cube's files are; a cube's id is the same either way.
 *
 * Naming convention follows existing DSL pattern:
 *   g-dashboard-tabulator-config.groovy → {cubeId}-cube-config.groovy
 */
@Service
public class CubesService {

	@Autowired
	private LimitsSandbox limitsSandbox;

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

	private CubeFiles userCubeFiles(String cubeId) throws IOException {
		return CubeFiles.inCubeFolder(new File(getCubesDir()), cubeId);
	}

	private CubeFiles sampleCubeFiles(String cubeId) throws IOException {
		return CubeFiles.find(new File(getSamplesCubesDir()), cubeId);
	}

	/** Returns true if the given cube ID is a bundled sample (read-only). */
	public boolean isSampleCube(String cubeId) throws IOException {
		return sampleCubeFiles(cubeId) != null;
	}

	/**
	 * Resolve the files of a cube ID.
	 * Looks first in config/cubes (user-owned), then in config/samples-cubes (read-only samples).
	 */
	private CubeFiles resolveCubeFiles(String cubeId) throws IOException {
		if (new File(getCubeDir(cubeId)).exists()) return userCubeFiles(cubeId);
		CubeFiles sample = sampleCubeFiles(cubeId);
		if (sample != null) return sample;
		return userCubeFiles(cubeId); // default to user dir for not-yet-existing cubes (used by save())
	}

	/**
	 * The same resolution, for whoever needs one of a cube's files rather than its content: the
	 * live cube reads a cube's {@code hints.json} this way, and a hints file is found wherever the
	 * cube itself is found, never anywhere else.
	 */
	public CubeFiles filesOf(String cubeId) throws IOException {
		return resolveCubeFiles(cubeId);
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

		for (CubeFiles files : CubeFiles.scan(cubesDir)) {
			String cubeId = files.getId();
			File metaFile = files.getMetadataFile();
			Map<String, String> info = new LinkedHashMap<>();
			info.put("id", cubeId);

			if (metaFile.exists()) {
				String xml = files.getMetadataXml();
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

		CubeFiles files = resolveCubeFiles(cubeId);
		boolean isSample = isSampleCube(cubeId) && !new File(getCubeDir(cubeId)).exists();

		File metaFile = files.getMetadataFile();
		if (metaFile.exists()) {
			String xml = files.getMetadataXml();
			result.put("name", extractXmlValue(xml, "name", cubeId));
			result.put("description", extractXmlValue(xml, "description", ""));
			result.put("connectionId", extractXmlValue(xml, "connectionId", ""));
		} else {
			result.put("name", cubeId);
			result.put("description", "");
			result.put("connectionId", "");
		}

		File dslFile = files.getDslFile();
		if (dslFile.exists()) {
			result.put("dslCode", Files.readString(dslFile.toPath()));
		} else {
			result.put("dslCode", "");
		}

		// Set when the DSL file holds this cube under a name: the file is shown whole, and whoever
		// parses it or generates SQL from it picks the cube by this name.
		result.put("cubeName", files.getCubeName());

		result.put("isSample", isSample);

		return result;
	}

	/**
	 * Save a cube definition (metadata + DSL code).
	 * Refuses to save sample cubes (read-only).
	 */
	public void save(String cubeId, String name, String description, String connectionId, String dslCode)
			throws IOException {
		// A saved cube keeps the name it has in its file (a copy of a named sample cube has one).
		save(cubeId, name, description, connectionId, dslCode, userCubeFiles(cubeId).getCubeName());
	}

	private void save(String cubeId, String name, String description, String connectionId, String dslCode,
			String cubeName) throws IOException {
		limitsSandbox.check(dslCode);
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
				+ (StringUtils.isBlank(cubeName) ? "" : "    <cubeName>" + escapeXml(cubeName) + "</cubeName>\n")
				+ "</cube>\n";
		CubeFiles files = userCubeFiles(cubeId);
		Files.writeString(files.getMetadataFile().toPath(), xml);

		// Save DSL code as plain groovy file
		Files.writeString(files.getDslFile().toPath(), dslCode != null ? dslCode : "");

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
				(String) source.get("dslCode"),
				(String) source.get("cubeName"));
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
		return CubeFiles.xmlValue(xml, tag, defaultValue);
	}

	private static String escapeXml(String s) {
		if (s == null) return "";
		return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
				.replace("\"", "&quot;").replace("'", "&apos;");
	}
}
