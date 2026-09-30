package com.flowkraft.exploredata.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.flowkraft.cubes.CubeWidgets;
import com.flowkraft.exploredata.export.DashboardDemos.Demo;

/**
 * What ships for each of the 25 demos is what the product's own exporter writes for it.
 *
 * <p>The author's file is the canvas. Every other file in a demo's folder is
 * {@link CanvasExportService}'s output, written here by {@link DashboardDemosExporter} and compared
 * byte for byte with what is in the tree. So a hand edit of a published dashboard turns this red,
 * and so does a change in the exporter that nobody regenerated for.
 *
 * <p><b>Regenerating.</b> {@code mvn test -Dtest=DashboardDemosExportParityTest -Ddd.write=true}
 * writes what the exporter wrote into {@code config/samples/g-<id>/}, and the same run then reports
 * what it changed. Without the flag nothing in the tree is touched.
 */
class DashboardDemosExportParityTest {

	/** The files the author writes, which the exporter neither reads back nor overwrites. */
	private static List<String> inputsOf(Demo demo) {
		return List.of(demo.reportId() + ".canvas.json", demo.reportId() + "-stories.json");
	}

	@Test
	@DisplayName("Every shipped demo folder is byte for byte what the exporter writes for it")
	void everyShippedFolderIsWhatTheExporterWrites() throws Exception {

		boolean write = Boolean.parseBoolean(System.getProperty(DashboardDemosExporter.WRITE, "false"));
		List<String> differences = new ArrayList<>();
		List<String> written = new ArrayList<>();
		int files = 0;

		for (Demo demo : DashboardDemos.all()) {
			Map<String, String> exported = DashboardDemosExporter.publish(demo);
			Map<String, String> shipped = DashboardDemosExporter.shipped(demo);
			files += exported.size();

			if (write) {
				written.addAll(install(demo, exported, shipped));
				continue;
			}

			Set<String> names = new LinkedHashSet<>(exported.keySet());
			names.addAll(shipped.keySet());
			for (String name : new TreeSet<>(names)) {
				String mine = exported.get(name);
				String theirs = shipped.get(name);
				if (mine == null)
					differences.add(demo.reportId() + "/" + name
							+ " is in the tree and the exporter does not write it");
				else if (theirs == null)
					differences.add(demo.reportId() + "/" + name
							+ " is what the exporter writes and it is not in the tree");
				else if (!mine.equals(theirs))
					differences.add(demo.reportId() + "/" + name + " differs: " + firstDifference(theirs, mine));
			}
		}

		if (write) {
			// The same run regenerates what is written from the index: the Gallery's cards and the
			// reference Athena reads. One flag, one pass, everything generated in step.
			written.addAll(DashboardDemosGallery.install(DashboardDemos.all()));
			System.out.println("-Ddd.write=true wrote " + written.size() + " change(s):\n"
					+ String.join("\n", written));
			return;
		}

		assertTrue(differences.isEmpty(), "what ships is not what the exporter writes ("
				+ "regenerate with -Ddd.write=true):\n" + String.join("\n", differences));
		assertTrue(files >= 25, "the exporter wrote " + files + " files for 25 demos");
	}

	@Test
	@DisplayName("Every demo ships the dashboard files its own widgets need, and no others")
	void everyDemoShipsWhatItsWidgetsNeed() throws Exception {

		List<String> wrong = new ArrayList<>();

		for (Demo demo : DashboardDemos.all()) {
			String id = demo.reportId();
			Set<String> shipped = DashboardDemosExporter.shipped(demo).keySet();

			// Every published dashboard has these three: the script that answers its tiles, the page
			// itself, and the spec its filter bar is built from.
			for (String needed : List.of(id + "-script.groovy", id + "-template.html",
					id + "-report-parameters-spec.groovy"))
				if (!shipped.contains(needed))
					wrong.add(id + " ships no " + needed);

			// A sidecar is written only for a kind of tile the dashboard actually has: the cube file
			// is there for the demos with a live cube widget, and nowhere else.
			boolean hasCube = false;
			for (Map<String, Object> widget : demo.widgets())
				hasCube |= LiveCubeWidgets.isLive(widget);
			boolean shipsCube = shipped.contains(id + CubeWidgets.SUFFIX);
			if (hasCube != shipsCube)
				wrong.add(id + (hasCube ? " has a live cube widget and ships no " + CubeWidgets.SUFFIX
						: " has no live cube widget and ships a " + CubeWidgets.SUFFIX));

			// settings.xml and reporting.xml are the installer's for every sample in the product.
			for (String installers : List.of("settings.xml", "reporting.xml"))
				if (Files.exists(DashboardDemosExporter.shippedFolder(demo).resolve(installers)))
					wrong.add(id + " ships a " + installers + ", which NoExeAssembler generates");
		}

		assertTrue(wrong.isEmpty(), String.join("\n", wrong));
	}

	@Test
	@DisplayName("Athena's list of the live demos is still the one the index says")
	void athenasReferenceHasNotDrifted() throws Exception {

		// Phase E's skill folder holds one generated file, and this is where it is held to its source:
		// rename a demo in the index and the reference the agent reads follows, or the build is red.
		Path reference = DashboardDemosGallery.LIVE_DEMOS;
		assertTrue(Files.exists(reference), reference
				+ " is generated from config/samples/dashboard-demos.json: run with -Ddd.write=true");
		assertEquals(DashboardDemosGallery.liveDemos(DashboardDemos.all()),
				Files.readString(reference),
				"references/live-demos.md is not what the index says (regenerate with -Ddd.write=true)");
	}

	@Test
	@DisplayName("The Gallery page in the tree holds exactly the cards and the contents the index says")
	void theGalleryPageHoldsWhatTheIndexSays() throws Exception {

		// The Gallery is the one page here nobody exported: its header, its info bar and its
		// stylesheet are written by hand, and only what is between the two marker pairs comes from
		// the index. So this is the whole of what a generator owns in that file - a demo renamed in
		// the index, or a card edited in the page, is this assertion and nothing else.
		List<Demo> demos = DashboardDemos.all();
		Path page = DashboardDemosGallery.template();
		assertTrue(Files.exists(page), page + " is the Gallery's own page (section 8): write it, then"
				+ " fill its markers with -Ddd.write=true");

		String held = Files.readString(page);
		assertEquals("\n" + DashboardDemosGallery.contents(demos) + "    ",
				DashboardDemosGallery.between(held, DashboardDemosGallery.CONTENTS_BEGIN,
						DashboardDemosGallery.CONTENTS_END),
				"the Gallery's contents list is not what the index says (regenerate with -Ddd.write=true)");
		assertEquals("\n" + DashboardDemosGallery.cards(demos) + "\n  ",
				DashboardDemosGallery.between(held, DashboardDemosGallery.CARDS_BEGIN,
						DashboardDemosGallery.CARDS_END),
				"the Gallery's cards are not what the index says (regenerate with -Ddd.write=true)");

		// And the author's half is still the author's: what is outside the markers is never written
		// by the generator, so it has to be asserted here or nothing holds it.
		for (String own : List.of("<h1 class=\"dash-title\">Dashboard Demos</h1>",
				"<p class=\"dash-subtitle\">One company, every department: 25 dashboards built in the"
						+ " Data Canvas</p>",
				"<div class=\"info-bar\">", "<style>", "</style>"))
			assertTrue(held.contains(own), "the Gallery page no longer has its own " + own);

		// A template is written into the page as HTML, so a <script> in it would not run anyway:
		// everything this page does is done by the web components and by plain links (section 8).
		assertTrue(!held.contains("<script"), "the Gallery page must hold no script");

		// The stub the packaged reporting.xml names, which is never executed: every card fetches its
		// own config and its own tiles.
		Path script = DashboardDemosGallery.FOLDER.resolve(DashboardDemosGallery.REPORT_ID + "-script.groovy");
		assertTrue(Files.exists(script), script + " is what reporting.xml names for the Gallery");
	}

	/**
	 * Writes what the exporter wrote into the demo's folder and returns one line per change: a file
	 * added, a file whose content moved, and a file the exporter no longer writes, which is removed
	 * so a folder never keeps a sidecar for a tile the demo has lost.
	 */
	private static List<String> install(Demo demo, Map<String, String> exported,
			Map<String, String> shipped) throws Exception {

		List<String> changes = new ArrayList<>();
		Path folder = DashboardDemosExporter.shippedFolder(demo);
		Files.createDirectories(folder);

		for (Map.Entry<String, String> one : exported.entrySet()) {
			String was = shipped.get(one.getKey());
			if (one.getValue().equals(was))
				continue;
			Files.writeString(folder.resolve(one.getKey()), one.getValue());
			changes.add((was == null ? "added   " : "changed ") + demo.reportId() + "/" + one.getKey());
		}

		for (String name : shipped.keySet()) {
			if (exported.containsKey(name) || inputsOf(demo).contains(name))
				continue;
			Files.deleteIfExists(folder.resolve(name));
			changes.add("removed " + demo.reportId() + "/" + name);
		}
		return changes;
	}

	/** Where two files first part, said in a line a person can act on. */
	private static String firstDifference(String theirs, String mine) {
		String[] left = theirs.split("\n", -1);
		String[] right = mine.split("\n", -1);
		for (int line = 0; line < Math.min(left.length, right.length); line++)
			if (!left[line].equals(right[line]))
				return "line " + (line + 1) + ", the tree has [" + left[line] + "], the exporter writes ["
						+ right[line] + "]";
		return "the tree has " + left.length + " lines, the exporter writes " + right.length;
	}

	@Test
	@DisplayName("The parity check can fail: a hand edit of a shipped file is found")
	void aHandEditOfAShippedFileIsFound() throws Exception {

		// Not written to the tree: the comparison is made here on a copy, which is the same
		// comparison the case above makes over all 25.
		Demo demo = DashboardDemos.all().get(0);
		Map<String, String> exported = DashboardDemosExporter.publish(demo);
		String name = demo.reportId() + "-script.groovy";
		assertTrue(exported.containsKey(name), "the first demo ships its script");

		String handEdited = exported.get(name).replaceFirst("\n", "\n// somebody edited this\n");
		assertEquals("line 2, the tree has [// somebody edited this], the exporter writes ["
				+ exported.get(name).split("\n", -1)[1] + "]",
				firstDifference(handEdited, exported.get(name)));
	}
}
