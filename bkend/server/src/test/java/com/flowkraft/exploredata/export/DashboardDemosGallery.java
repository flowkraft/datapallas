package com.flowkraft.exploredata.export;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.flowkraft.exploredata.export.DashboardDemos.Demo;

/**
 * The Gallery's cards, and Athena's list of the live demos, written from one index.
 *
 * <p>{@code config/samples/dashboard-demos.json} says what each demo is - its area, its title, the
 * question it answers, who reads it, what they decide, what they find, and how tall its dashboard is.
 * Three readers need that said again in their own form: the Gallery page's contents list, the
 * Gallery page's 25 cards, and the reference Athena reads when someone asks which dashboard fits
 * their data. All three are generated here, so a demo renamed in the index cannot keep an old name
 * anywhere else, and none of them is written by hand.
 *
 * <p>The Gallery template holds the generated text between marker comments, the way a generated
 * block is always marked: everything outside them - the header, the info bar, the stylesheet - is
 * the author's and is never touched. {@code DashboardDemosExportParityTest} regenerates both blocks
 * and fails if what is in the template is not what the index says.
 */
final class DashboardDemosGallery {

	/** The Gallery's own report id: the page that holds all 25. */
	static final String REPORT_ID = "g-dashboard-demos";

	static final String CONTENTS_BEGIN = "<!-- BEGIN contents: generated from "
			+ "config/samples/dashboard-demos.json. Do not edit by hand. -->";
	static final String CONTENTS_END = "<!-- END contents -->";
	static final String CARDS_BEGIN = "<!-- BEGIN cards: generated from "
			+ "config/samples/dashboard-demos.json. Do not edit by hand. -->";
	static final String CARDS_END = "<!-- END cards -->";

	/** Where the Gallery's own sample folder is, and the page inside it. */
	static final Path FOLDER = Path.of(DashboardDemos.SAMPLES, REPORT_ID);

	/**
	 * Athena's reference. The skill folder is Phase E's; this one file in it is generated here,
	 * because the index it is made from is this phase's.
	 */
	static final Path LIVE_DEMOS = Path.of("../../asbl/src/main/external-resources/db-template/_apps",
			"flowkraft/_ai-hub/.skills/datapallas-dashboard-patterns/references/live-demos.md");

	private DashboardDemosGallery() {
	}

	static Path template() {
		return FOLDER.resolve(REPORT_ID + "-template.html");
	}

	// ------------------------------------------------------------------ the page ---

	/** The contents list: one entry per area, with its demos under it, in the index's own order. */
	static String contents(List<Demo> demos) {
		StringBuilder out = new StringBuilder();
		for (Map.Entry<String, List<Demo>> area : byArea(demos).entrySet()) {
			out.append("      <li><a href=\"#").append(areaId(area.getKey())).append("\">")
					.append(html(area.getKey())).append("</a>\n        <ul>\n");
			for (Demo demo : area.getValue())
				out.append("          <li><a href=\"#").append(demo.id()).append("\">")
						.append(html(field(demo, "title"))).append("</a></li>\n");
			out.append("        </ul>\n      </li>\n");
		}
		return out.toString();
	}

	/**
	 * The 25 cards, under one heading per area: what the demo is, the line that says who reads it and
	 * what they decide, a link to its own page, the dashboard itself, and the page that shows how it
	 * was built.
	 *
	 * <p>The dashboard is the very one the Canvas published, named only by its report id:
	 * {@code lazy} so it fetches nothing until the reader scrolls to it, {@code show-stories} so its
	 * own stories and their Show Me buttons appear above its filter bar, and the card reserves its
	 * height so the page does not jump while the dashboards arrive.
	 */
	static String cards(List<Demo> demos) {
		StringBuilder out = new StringBuilder();
		for (Map.Entry<String, List<Demo>> area : byArea(demos).entrySet()) {
			out.append("  <h2 class=\"area-heading\" id=\"").append(areaId(area.getKey())).append("\">")
					.append(html(area.getKey())).append("</h2>\n");
			for (Demo demo : area.getValue())
				out.append(card(demo, area.getKey()));
		}
		return out.toString();
	}

	private static String card(Demo demo, String area) {
		String id = demo.id();
		return "\n  <div class=\"card\" id=\"" + id + "\">\n"
				+ "    <p class=\"card-area\" id=\"" + id + "-area\">" + html(area) + "</p>\n"
				+ "    <h3 class=\"card-title\">" + html(field(demo, "title")) + "</h3>\n"
				+ "    <p class=\"card-description\">" + html(field(demo, "question")) + "</p>\n"
				+ "    <p class=\"card-grain\"><strong>Who:</strong> " + html(field(demo, "who"))
				+ " &middot; <strong>Decision:</strong> " + html(field(demo, "decision"))
				+ " &middot; <strong>Finding:</strong> " + html(field(demo, "finding")) + "</p>\n"
				+ "    <p class=\"card-links\"><a id=\"lnkOpenAlone-" + id + "\" href=\"/dashboard/"
				+ demo.reportId() + "\">Open on its own &rarr;</a></p>\n"
				+ "    <div class=\"card-dashboard\" style=\"min-height: " + height(demo) + "px\">\n"
				+ "      <rb-dashboard report-id=\"" + demo.reportId()
				+ "\" api-base-url=\"/api\" lazy show-stories></rb-dashboard>\n"
				+ "    </div>\n"
				+ "    <p class=\"card-links\"><a id=\"lnkHowBuilt-" + id + "\" href=\""
				+ html(field(demo, "howItWasBuiltUrl"))
				+ "\" target=\"_blank\" rel=\"noopener\">How was this dashboard built? &rarr;</a></p>\n"
				+ "  </div>\n";
	}

	// ---------------------------------------------------------------- the skill ---

	/**
	 * What Athena reads when someone asks which dashboard fits their data: every demo, by area, with
	 * the question it answers, who reads it, the tiles it is made of, and where to look at it.
	 *
	 * <p>The tiles are counted off the canvas itself, so this list says what each demo really holds
	 * and not what a description of it once said.
	 */
	static String liveDemos(List<Demo> demos) throws Exception {
		StringBuilder out = new StringBuilder();
		out.append("# The dashboards DataPallas ships, live\n\n");
		out.append("Every dashboard below is in the product: built in the Data Canvas, published to a\n");
		out.append("report id, and open in the Dashboard Demos gallery on a demo installation. They are\n");
		out.append("one company's 25 dashboards, so a reader can see how each department's page is put\n");
		out.append("together before building their own.\n\n");
		out.append("Generated from `config/samples/dashboard-demos.json` and the demos' own canvases:\n");
		out.append("do not edit by hand.\n");
		for (Map.Entry<String, List<Demo>> area : byArea(demos).entrySet()) {
			out.append("\n## ").append(area.getKey()).append("\n");
			for (Demo demo : area.getValue()) {
				out.append("\n### ").append(number(demo)).append(" ").append(field(demo, "title"))
						.append(" (`").append(demo.reportId()).append("`)\n");
				out.append("- **Question:** ").append(field(demo, "question")).append("\n");
				out.append("- **Who:** ").append(field(demo, "who")).append(" **Decision:** ")
						.append(field(demo, "decision")).append("\n");
				out.append("- **Finding:** ").append(field(demo, "finding")).append("\n");
				out.append("- **Tiles:** ").append(tiles(demo)).append("\n");
				out.append("- **Filters:** ").append(filters(demo)).append("\n");
				out.append("- **Stories:** ").append(stories(demo)).append("\n");
				out.append("- **In the gallery:** `/dashboard/").append(REPORT_ID).append("#")
						.append(demo.id()).append("` \u00b7 **on its own:** `/dashboard/")
						.append(demo.reportId()).append("`\n");
				out.append("- **How it was built:** ").append(field(demo, "howItWasBuiltUrl")).append("\n");
			}
		}
		return out.toString();
	}

	/** The kinds of tile a demo is made of, each with how many of it, in the order the page holds them. */
	static String tiles(Demo demo) {
		Map<String, Integer> counted = new LinkedHashMap<>();
		for (Map<String, Object> widget : demo.widgets()) {
			String kind = kindOf(widget);
			if (kind.isEmpty())
				continue;
			counted.merge(kind, 1, Integer::sum);
		}
		List<String> said = new ArrayList<>();
		for (Map.Entry<String, Integer> one : counted.entrySet())
			said.add(one.getValue() == 1 ? one.getKey() : one.getKey() + " x" + one.getValue());
		return said.isEmpty() ? "none" : String.join(", ", said);
	}

	/**
	 * What kind of tile a widget is, as a reader would name it: a chart by the chart it draws, and
	 * everything else by its own kind. A title and a divider are not tiles a reader reads, so they are
	 * left out.
	 */
	private static String kindOf(Map<String, Object> widget) {
		String type = Objects.toString(widget.get("type"), "");
		if ("text".equals(type) || "divider".equals(type))
			return "";
		if (!"chart".equals(type))
			return "tabulator".equals(type) ? "table" : type;
		Object display = widget.get("displayConfig");
		Object dsl = display instanceof Map<?, ?> map ? map.get("dslConfig") : null;
		Object drawn = dsl instanceof Map<?, ?> map ? map.get("type") : null;
		String chart = Objects.toString(drawn, "");
		return chart.isEmpty() ? "chart" : chart + " chart";
	}

	/**
	 * A demo's filters: what the reader sees on the parameter bar, with the name the dashboard knows
	 * each one by, which is the name a story and a link both use.
	 */
	static String filters(Demo demo) {
		List<String> offered = new ArrayList<>();
		for (Map<String, Object> parameter : demo.parameters()) {
			String name = Objects.toString(parameter.get("id"), "");
			if (name.isEmpty())
				continue;
			String label = Objects.toString(parameter.get("label"), "");
			offered.add(label.isEmpty() ? "`" + name + "`" : label + " (`" + name + "`)");
		}
		return offered.isEmpty() ? "none" : String.join(", ", offered);
	}

	/** The questions a demo answers with one click of Show Me. */
	static String stories(Demo demo) throws Exception {
		List<String> asked = new ArrayList<>();
		for (Map<String, Object> story : demo.stories())
			asked.add("\"" + Objects.toString(story.get("question"), "") + "\"");
		return asked.isEmpty() ? "none" : String.join(" ", asked);
	}

	// ------------------------------------------------------------------ writing ---

	/** What the template holds between two markers, or null when the markers are not there. */
	static String between(String page, String begin, String end) {
		int from = page.indexOf(begin);
		int to = page.indexOf(end);
		if (from < 0 || to < from)
			return null;
		return page.substring(from + begin.length(), to);
	}

	/** The same page with one marked block replaced by what the index says it is. */
	static String replaced(String page, String begin, String end, String block) {
		String was = between(page, begin, end);
		if (was == null)
			throw new IllegalStateException("the template has no " + begin);
		return page.substring(0, page.indexOf(begin) + begin.length()) + block
				+ page.substring(page.indexOf(end));
	}

	/**
	 * Writes the generated blocks where they belong and returns one line per file that moved: the two
	 * blocks of the Gallery's template, and Athena's reference.
	 */
	static List<String> install(List<Demo> demos) throws Exception {
		List<String> changes = new ArrayList<>();

		Path page = template();
		if (Files.exists(page)) {
			String was = Files.readString(page);
			String now = replaced(was, CONTENTS_BEGIN, CONTENTS_END, "\n" + contents(demos) + "    ");
			now = replaced(now, CARDS_BEGIN, CARDS_END, "\n" + cards(demos) + "\n  ");
			if (!now.equals(was)) {
				Files.writeString(page, now);
				changes.add("changed " + REPORT_ID + "/" + page.getFileName());
			}
		} else {
			changes.add("missing " + REPORT_ID + "/" + page.getFileName()
					+ ", so its cards were not written");
		}

		String reference = liveDemos(demos);
		String before = Files.exists(LIVE_DEMOS) ? Files.readString(LIVE_DEMOS) : null;
		if (!reference.equals(before)) {
			Files.createDirectories(LIVE_DEMOS.getParent());
			Files.writeString(LIVE_DEMOS, reference);
			changes.add((before == null ? "added   " : "changed ") + "references/live-demos.md");
		}
		return changes;
	}

	// ------------------------------------------------------------------ helpers ---

	/** The demos of one index, grouped by area, each group in the index's own order. */
	static Map<String, List<Demo>> byArea(List<Demo> demos) {
		Map<String, List<Demo>> grouped = new LinkedHashMap<>();
		for (Demo demo : demos)
			grouped.computeIfAbsent(field(demo, "area"), one -> new ArrayList<>()).add(demo);
		return grouped;
	}

	/** An area's anchor: its letter, which is what the contents list links to. */
	static String areaId(String area) {
		String letter = area.split(" ", 2)[0].toLowerCase();
		StringBuilder kept = new StringBuilder("area-");
		for (char one : letter.toCharArray())
			if (Character.isLetterOrDigit(one))
				kept.append(one);
		return kept.toString();
	}

	static String field(Demo demo, String name) {
		return Objects.toString(demo.index().get(name), "");
	}

	private static String number(Demo demo) {
		return String.format("DD%02d", demo.nn());
	}

	private static int height(Demo demo) {
		Object given = demo.index().get("heightPx");
		return given instanceof Number number ? number.intValue() : 0;
	}

	/** Text written into a page: the four characters that would otherwise be markup. */
	static String html(String text) {
		return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
				.replace("\"", "&quot;").replace("·", "&middot;");
	}
}
