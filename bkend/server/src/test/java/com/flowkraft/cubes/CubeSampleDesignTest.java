package com.flowkraft.cubes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
 * <p>It also proves the other thing a reader reads on a cube: its stories. Each one asks a question
 * of its own, in words written for a reader and not for us, and the field names it points at pair up.
 *
 * <p>Each rule has its negative half beside it - broken names and broken stories the same checker
 * must reject - so neither can rot into a no-op without anybody noticing.
 */
class CubeSampleDesignTest {

	private static final String SAMPLES_CUBES_DIR = "../../asbl/src/main/external-resources/db-template/config/samples-cubes";

	/**
	 * The cubes that ship, by id. Kept here rather than read off the directory: a cube that
	 * disappears has to turn this test red, not shrink its own sweep.
	 */
	private static final List<String> SHIPPED_CUBES = List.of("northwind-sales", "northwind-customers",
			"northwind-hr", "northwind-inventory", "northwind-warehouse", "online-sales",
			"sales-pipeline", "support-desk", "freight-shipments", "student-enrollments", "customer-invoices",
			"customer-payments", "invoice-balances", "customer-statement", "depot-network",
			"student-progress", "dd-sales", "dd-finance", "dd-support");

	private static final Pattern XML_NAME = Pattern.compile("<name>\\s*(.*?)\\s*</name>", Pattern.DOTALL);

	/**
	 * A note left in a question for us rather than for a reader: what the old cubes lacked, or the
	 * number a plan gave the story. Both were on the page in 52f8f42f (D8).
	 */
	private static final Pattern NOTE_TO_US = Pattern.compile("\\((new\\b[^)]*|story \\d+)\\)");

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

	/**
	 * Every story a shipped cube offers is a story a reader can read.
	 *
	 * <p>The asks are taken the way a widget takes them, through {@link CubeHints}, so a variant is
	 * one of them: on the page each ask is a card with a <b>Show Me</b> of its own, and the owner's
	 * rule is that no reader is asked the same thing twice (D9). A question written for us - the
	 * "(new: the old cubes had no rep)" kind of note from the cubes redesign, or a plan's own story
	 * number - is not a question for a reader either (D8), and a sentence whose {@code **} do not
	 * pair up would show the reader an asterisk where the renderer wanted a bold field name.
	 */
	@Test
	void everyShippedStoryReadsAsAStory() throws Exception {
		Map<String, String> wrong = new LinkedHashMap<>();
		for (String cubeId : SHIPPED_CUBES) {
			CubeFiles files = filesOf(cubeId);
			// A story may ask its question of a period, and those days are written relative to the
			// day the data calls today (R7). The demo data's today is pinned here, as everywhere.
			List<Map<String, Object>> asks = CubeHints.of(files.getHintsFile(), files.getCubeName(),
					() -> LocalDate.parse("2026-09-30"));
			assertFalse(asks.isEmpty(), "A shipped cube that answers no question of its own: " + cubeId);
			String complaint = complainAboutStories(asks);
			if (complaint != null) {
				wrong.put(cubeId, complaint);
			}
		}
		assertEquals(Map.of(), wrong, "the stories a reader reads: " + wrong);
	}

	/** The negative half: the same question twice, a note written for us, and a lonely {@code **}. */
	@Test
	void aStoryThatRepeatsItselfOrTalksToUsIsCaught() {
		assertNotNull(complainAboutStories(List.of(
				story("What did we sell?", "Tick **Units**."),
				story("What did we sell?", "Or tick **Net Sales**."))),
				"the same question on two cards is the defect the owner met");
		assertNotNull(complainAboutStories(List.of(
				story("What is actually on the invoices? (new: the lines were in no cube)", "Tick **Units**."))),
				"a note from the redesign is not a question for a reader");
		assertNotNull(complainAboutStories(List.of(
				story("What is on our plate? (story 31)", "Tick **Tickets**."))),
				"and neither is a plan's story number");
		assertNotNull(complainAboutStories(List.of(story("What did we sell?", "Tick **Units."))),
				"an unpaired ** is an asterisk on the reader's screen");
		assertNotNull(complainAboutStories(List.of(story("", "Tick **Units**."))),
				"a card with no question says nothing at all");
		assertNull(complainAboutStories(List.of(
				story("What did we sell, and where?", "Tick **Units** and **Country**."),
				story("And what did it leave us?", "Add **Gross Margin** and **Margin %**."))),
				"two questions, two answers, and every field name in a pair");
	}

	/** An ask, as far as the story rule is concerned. */
	private static Map<String, Object> story(String question, String text) {
		return Map.of("question", question, "text", text);
	}

	/** What is wrong with the stories of one cube, or null when nothing is. */
	private String complainAboutStories(List<Map<String, Object>> asks) {
		Set<String> asked = new LinkedHashSet<>();
		for (Map<String, Object> ask : asks) {
			String question = String.valueOf(ask.get("question")).trim();
			String text = String.valueOf(ask.get("text"));
			if (question.isEmpty()) {
				return "a card with no question of its own, whose sentence is '" + text + "'";
			}
			if (!asked.add(question)) {
				return "two cards ask '" + question + "', so a reader reads the same story twice";
			}
			Matcher note = NOTE_TO_US.matcher(question);
			if (note.find()) {
				return "'" + question + "' carries '" + note.group() + "', which is written for us";
			}
			if ((text.split("\\*\\*", -1).length - 1) % 2 != 0) {
				return "'" + text + "' leaves a ** unpaired, so the reader sees an asterisk";
			}
		}
		return null;
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
