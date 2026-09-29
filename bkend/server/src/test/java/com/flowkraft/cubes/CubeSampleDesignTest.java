package com.flowkraft.cubes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;

/**
 * The shipped sample cubes show the user a cube's title, never a folder id - the owner's rule for the UI.
 *
 * <p>CubeSampleSqlExecutesTest proves the samples RUN. This proves only the name. How a cube is modelled
 * is not checked here.
 *
 * <p>The rule has its negative half beside it - broken names the same checker must reject - so it
 * cannot rot into a no-op without anybody noticing.
 */
class CubeSampleDesignTest {

	private static final String SAMPLES_CUBES_DIR = "../../asbl/src/main/external-resources/db-template/config/samples-cubes";

	/**
	 * The cubes that ship, by id. Kept here rather than read off the directory: a cube that
	 * disappears has to turn this test red, not shrink its own sweep.
	 */
	private static final List<String> SHIPPED_CUBES = List.of("northwind-sales", "northwind-customers",
			"northwind-hr", "northwind-inventory", "northwind-warehouse", "online-sales", "shop-for-a-period",
			"sales-pipeline", "support-desk", "freight-shipments", "student-enrollments", "customer-invoices",
			"customer-payments", "invoice-balances", "customer-statement", "depot-network",
			"student-progress");

	private static final Pattern XML_NAME = Pattern.compile("<name>\\s*(.*?)\\s*</name>", Pattern.DOTALL);

	/**
	 * The name in cube.xml is what /api/cubes hands the UI, so it is the words the user reads in
	 * every list. It has to be the cube's own title: a folder id is a developer's word, an empty
	 * name makes CubesService fall back to the folder id, which shows the user 'freight-shipments',
	 * and a name that differs from the title shows the same cube under two names.
	 */
	@Test
	void everyShippedCubeIsNamedByItsTitle() throws Exception {
		Map<String, String> wrong = new LinkedHashMap<>();
		for (String cubeId : SHIPPED_CUBES) {
			String xmlName = xmlNameOf(cubeId);
			String title = parse(cubeId).getTitle();
			String complaint = complainAboutName(cubeId, xmlName, title);
			if (complaint != null) {
				wrong.put(cubeId, complaint);
			}
		}
		assertEquals(Map.of(), wrong, "cube.xml names the cube for the user: " + wrong);
	}

	/** The negative half: an empty name, a folder id as a name, and a name left behind by a rename. */
	@Test
	void aNameThatIsNotTheTitleIsCaught() {
		assertNotNull(complainAboutName("freight-shipments", "", "Freight Shipments"), "Empty name");
		assertNotNull(complainAboutName("freight-shipments", "freight-shipments", "Freight Shipments"),
				"The folder id is not a name for a user");
		assertNotNull(complainAboutName("freight-shipments", "Shipments", "Freight Shipments"),
				"A name left behind by a rename");
		assertNull(complainAboutName("freight-shipments", "Freight Shipments", "Freight Shipments"),
				"The title itself is the one right answer");
	}

	/** What is wrong with the name a cube shows the user, or null when nothing is. */
	private String complainAboutName(String cubeId, String xmlName, String title) {
		if (xmlName == null || xmlName.isBlank()) {
			return "cube.xml has no <name>, so /api/cubes falls back to the folder id '" + cubeId + "'";
		}
		if (xmlName.equals(cubeId)) {
			return "cube.xml names the cube by its folder id, which is a developer's word";
		}
		if (title == null || title.isBlank()) {
			return "the cube has no title to be named by";
		}
		if (!xmlName.equals(title)) {
			return "cube.xml says '" + xmlName + "' but the cube's title is '" + title + "'";
		}
		return null;
	}

	/** The cube itself: its file's unnamed cube, or the one the file holds under the cube's name. */
	private CubeOptions parse(String cubeId) throws Exception {
		File configFile = filesOf(cubeId).getDslFile();
		assertTrue(configFile.exists(), "A shipped cube with no config file: " + configFile.getAbsolutePath());
		CubeOptions file = CubeOptionsParser.parseGroovyCubeDslCode(Files.readString(configFile.toPath()));
		return CubeSqlGenerator.pickCube(file, filesOf(cubeId).getCubeName());
	}

	private String xmlNameOf(String cubeId) throws Exception {
		File cubeXml = filesOf(cubeId).getMetadataFile();
		assertTrue(cubeXml.exists(), "A shipped cube with no cube.xml: " + cubeXml.getAbsolutePath());
		Matcher matcher = XML_NAME.matcher(filesOf(cubeId).getMetadataXml());
		return matcher.find() ? matcher.group(1) : null;
	}

	private CubeFiles filesOf(String cubeId) throws Exception {
		CubeFiles files = CubeFiles.find(new File(SAMPLES_CUBES_DIR), cubeId);
		assertNotNull(files, "No shipped cube '" + cubeId + "' under " + new File(SAMPLES_CUBES_DIR).getAbsolutePath());
		return files;
	}
}
