package com.flowkraft.cubes;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.commons.lang3.StringUtils;

/**
 * Where one cube's files are on disk: its metadata, its DSL file, its hints, and - when the DSL file
 * holds it under a name - that name.
 *
 * Two layouts are read, side by side in the same directory:
 *
 *   {dir}/{cubeId}/cube.xml                          one folder per cube: the user's own cubes
 *   {dir}/{cubeId}/{cubeId}-cube-config.groovy
 *   {dir}/{cubeId}/hints.json
 *
 *   {dir}/{domain}/{file}-cube.xml                   one folder per domain, holding the cube files
 *   {dir}/{domain}/{file}-cube-config.groovy         of that domain: the shipped samples (northwind,
 *   {dir}/{domain}/{file}-hints.json                 crm-sales, erp-finance, ...)
 *
 * A folder with a cube.xml is a cube folder; any other folder is a domain folder, where each
 * {file}-cube.xml goes with the {file}-cube-config.groovy and {file}-hints.json of the same name.
 * A {file}-cube.xml whose root is {@code <cube>} is the file's unnamed cube, and its id is {file}.
 * One whose root is {@code <cubes>} describes the cubes the DSL file holds under a name, one
 * {@code <cube>} each, with that name in {@code <cubeName>}; each is a cube of its own, with the name
 * as its id. Their hints share the one hints file, each hint's query naming its cube in cubeName.
 */
public final class CubeFiles {

	public static final String METADATA = "cube.xml";
	public static final String DSL_SUFFIX = "-cube-config.groovy";
	private static final String METADATA_SUFFIX = "-cube.xml";
	private static final String HINTS = "hints.json";
	private static final String HINTS_SUFFIX = "-hints.json";

	private static final Pattern ONE_CUBE = Pattern.compile("<cube>(.*?)</cube>", Pattern.DOTALL);

	private final String id;
	private final File metadataFile;
	private final String metadataXml;
	private final File dslFile;
	private final File hintsFile;
	private final String cubeName;

	private CubeFiles(String id, File metadataFile, String metadataXml, File dslFile, File hintsFile,
			String cubeName) {
		this.id = id;
		this.metadataFile = metadataFile;
		this.metadataXml = metadataXml;
		this.dslFile = dslFile;
		this.hintsFile = hintsFile;
		this.cubeName = cubeName;
	}

	/** The files of a cube that has - or will have - a folder of its own under dir. */
	public static CubeFiles inCubeFolder(File dir, String cubeId) throws IOException {
		File folder = new File(dir, cubeId);
		File metadata = new File(folder, METADATA);
		String xml = metadata.exists() ? Files.readString(metadata.toPath()) : "";
		return new CubeFiles(cubeId, metadata, xml, new File(folder, cubeId + DSL_SUFFIX), new File(folder, HINTS),
				StringUtils.trimToNull(xmlValue(xml, "cubeName", null)));
	}

	/**
	 * Every cube under dir, cube folders and domain folders alike, in folder then file order. When
	 * two of them claim the same id, the first one found is the cube and the other is not listed.
	 */
	public static List<CubeFiles> scan(File dir) throws IOException {
		List<CubeFiles> cubes = new ArrayList<>();
		File[] folders = dir.listFiles(File::isDirectory);
		if (folders == null) return cubes;
		Arrays.sort(folders);

		Set<String> seen = new LinkedHashSet<>();
		for (File folder : folders) {
			if (new File(folder, METADATA).exists()) {
				if (seen.add(folder.getName())) cubes.add(inCubeFolder(dir, folder.getName()));
				continue;
			}
			File[] metadataFiles = folder.listFiles((d, name) -> name.endsWith(METADATA_SUFFIX));
			if (metadataFiles == null) continue;
			Arrays.sort(metadataFiles);
			for (File metadata : metadataFiles) {
				for (CubeFiles cube : inDomainFolder(metadata)) {
					if (seen.add(cube.id)) cubes.add(cube);
				}
			}
		}
		return cubes;
	}

	/** The cube with this id under dir, or null when there is none. */
	public static CubeFiles find(File dir, String cubeId) throws IOException {
		if (StringUtils.isBlank(cubeId) || !dir.isDirectory()) return null;
		if (new File(new File(dir, cubeId), METADATA).exists()) return inCubeFolder(dir, cubeId);
		for (CubeFiles cube : scan(dir)) {
			if (cube.id.equals(cubeId)) return cube;
		}
		return null;
	}

	/** The cubes one {file}-cube.xml describes: its unnamed cube, or each of its named ones. */
	private static List<CubeFiles> inDomainFolder(File metadata) throws IOException {
		String file = StringUtils.removeEnd(metadata.getName(), METADATA_SUFFIX);
		File folder = metadata.getParentFile();
		File dsl = new File(folder, file + DSL_SUFFIX);
		File hints = new File(folder, file + HINTS_SUFFIX);
		String xml = Files.readString(metadata.toPath());

		List<CubeFiles> cubes = new ArrayList<>();
		if (!xml.contains("<cubes>")) {
			cubes.add(new CubeFiles(file, metadata, xml, dsl, hints, null));
			return cubes;
		}
		Matcher each = ONE_CUBE.matcher(xml);
		while (each.find()) {
			String named = StringUtils.trimToNull(xmlValue(each.group(1), "cubeName", null));
			if (named != null) cubes.add(new CubeFiles(named, metadata, each.group(1), dsl, hints, named));
		}
		return cubes;
	}

	/** The text of the first {@code <tag>} in xml, or defaultValue when there is none. */
	public static String xmlValue(String xml, String tag, String defaultValue) {
		int start = xml.indexOf("<" + tag + ">");
		int end = xml.indexOf("</" + tag + ">");
		if (start >= 0 && end > start) {
			return xml.substring(start + tag.length() + 2, end);
		}
		return defaultValue;
	}

	public String getId() { return id; }

	/** The file the metadata is in - shared by every cube it describes. */
	public File getMetadataFile() { return metadataFile; }

	/** This cube's own metadata: the whole file, or its {@code <cube>} in a file of several. */
	public String getMetadataXml() { return metadataXml; }

	/** This cube's metadata value for tag, or defaultValue when it has none. */
	public String metadata(String tag, String defaultValue) {
		return xmlValue(metadataXml, tag, defaultValue);
	}

	public File getDslFile() { return dslFile; }

	/** The file this cube's hints are in - shared by the cubes of one DSL file. */
	public File getHintsFile() { return hintsFile; }

	/** The name the cube has in its DSL file, or null when it is the file's unnamed cube. */
	public String getCubeName() { return cubeName; }
}
