package com.flowkraft.exploredata.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.flowkraft.exploredata.export.DashboardDemos.Demo;
import com.flowkraft.exploredata.export.DashboardDemos.Twin;

/**
 * A "(low-code)" twin is the same dashboard as its original, built with less code.
 *
 * <p>Each twin is listed in {@code config/samples/dashboard-demos-low-code.json} and ships its own
 * canvas, built by its recipe in {@code canvas-dashboard-demos-low-code.spec.ts}. Here the two
 * published scripts are run side by side on the frozen rows: every tile of the twin must be handed
 * the rows its original is handed (columns matched by position, a number to the cent), at the
 * defaults and under every interaction of the original's {@code checks.json}; and every claim of
 * that file must hold on the twin's own rows.
 */
class DashboardDemosTwinsTest {

	/** How near two numbers must be to be the same number on a tile: a currency's cent. */
	private static final double CENT = 0.005;
	private static final double HUNDREDTH_OF_A_PERCENT = 0.00005;

	@Test
	@DisplayName("The Gallery shows each demo once: its twin where it has one, else itself")
	void theGalleryShowsTheTwinInPlaceOfItsOriginal() throws Exception {

		// Owner decision 21: on the Gallery a reader sees each dashboard once, in its least-code
		// version; the e2e keeps running all 37.
		Map<String, String> twinOf = new LinkedHashMap<>();
		for (Twin twin : DashboardDemos.twins())
			twinOf.put(twin.original().id(), twin.twin().reportId());

		List<String> wrong = new ArrayList<>();
		for (Demo demo : DashboardDemos.all()) {
			String wanted = twinOf.getOrDefault(demo.id(), demo.reportId());
			if (!demo.galleryReportId().equals(wanted))
				wrong.add(demo.id() + "'s card shows " + demo.galleryReportId() + ", not " + wanted);
		}
		assertTrue(wrong.isEmpty(), "the Gallery does not show the least-code version:\n" + String.join("\n", wrong));
	}

	@Test
	@DisplayName("Every twin is named after its original and has its widgets, in order and type, and its stories")
	void everyTwinIsItsOriginalByName() throws Exception {

		List<String> wrong = new ArrayList<>();
		for (Twin twin : DashboardDemos.twins()) {
			Demo original = twin.original();
			Demo mine = twin.twin();
			if (!mine.id().equals(original.id() + "-low-code"))
				wrong.add(mine.id() + " is not named <original id>-low-code");
			if (!mine.reportId().equals("g-" + mine.id()))
				wrong.add(mine.reportId() + " is not g-<twin id>");
			String title = Objects.toString(original.index().get("title"), "") + " (low-code)";
			if (!twin.title().equals(title))
				wrong.add(mine.id() + " is titled '" + twin.title() + "', not '" + title + "'");
			if (!title.equals(Objects.toString(mine.canvas().get("name"), "")))
				wrong.add(mine.id() + "'s canvas is not named '" + title + "'");

			if (!mine.widgetIds().equals(original.widgetIds()))
				wrong.add(mine.id() + " has the widgets " + mine.widgetIds() + ", its original " + original.widgetIds());
			else
				for (int i = 0; i < mine.widgets().size(); i++)
					if (!Objects.equals(mine.widgets().get(i).get("type"), original.widgets().get(i).get("type")))
						wrong.add(mine.id() + " / " + mine.widgetIds().get(i) + " is a "
								+ mine.widgets().get(i).get("type") + ", its original a " + original.widgets().get(i).get("type"));

			Path theirs = Paths.get(DashboardDemos.SAMPLES, original.reportId(), original.reportId() + "-stories.json");
			Path ours = Paths.get(DashboardDemos.SAMPLES, mine.reportId(), mine.reportId() + "-stories.json");
			if (Files.exists(theirs) && (!Files.exists(ours) || !Files.readString(ours).equals(Files.readString(theirs))))
				wrong.add(mine.id() + " does not ship its original's stories");
		}
		assertTrue(wrong.isEmpty(), String.join("\n", wrong));
	}

	@Test
	@DisplayName("Every tile of a twin is handed its original's rows, and every claim holds on them")
	void everyTwinAnswersWhatItsOriginalAnswers() throws Exception {

		Connection connection = DashboardDemos.dashDemo();
		List<String> wrong = new ArrayList<>();
		int tiles = 0;
		int claims = 0;

		for (Twin twin : DashboardDemos.twins()) {
			Demo original = twin.original();
			List<String> moments = new ArrayList<>(List.of("defaults"));
			for (Map<String, Object> interaction : original.interactions())
				moments.add(Objects.toString(interaction.get("id"), ""));

			for (String moment : moments) {
				Map<String, Object> params = original.paramsOf(moment);
				Map<String, List<Map<String, Object>>> theirs = DashboardDemos.answers(original, params, connection);
				Map<String, List<Map<String, Object>>> ours = DashboardDemos.answers(twin.twin(), params, connection);
				String at = twin.twin().reportId() + " / " + moment + " / ";

				// Tile by tile in canvas order: a component id is made from what the widget reads, so
				// the twin's tile has its own id, and its place is what says which original it is.
				List<Map<String, Object>> widgets = original.widgets();
				for (int i = 0; i < widgets.size(); i++) {
					List<Map<String, Object>> want = theirs.get(DashboardDemos.componentIdOf(widgets.get(i)));
					if (want == null)
						continue;
					List<Map<String, Object>> got = ours.get(DashboardDemos.componentIdOf(twin.twin().widgets().get(i)));
					tiles++;
					String difference = got == null ? "the tile was never asked" : difference(want, got);
					if (difference != null)
						wrong.add(at + widgets.get(i).get("id") + ": " + difference);
				}

				List<Map<String, Object>> kpis = "defaults".equals(moment) ? original.kpis()
						: kpisOf(original.interaction(moment));
				for (Map<String, Object> kpi : kpis) {
					String key = Objects.toString(kpi.get("widget"), "");
					Map<String, Object> widget = original.widget(key);
					int place = original.widgets().indexOf(widget);
					List<Map<String, Object>> want = theirs.get(DashboardDemos.componentIdOf(widget));
					List<Map<String, Object>> got = ours.get(DashboardDemos.componentIdOf(twin.twin().widgets().get(place)));
					if (want == null || got == null)
						continue;
					claims++;
					Object read = DashboardDemos.reading(widget, DashboardDemos.renamed(got, namesOf(want)), kpi);
					if (!DashboardDemos.shows(kpi.get("value"), read))
						wrong.add(at + key + ": the claim says " + kpi.get("value") + ", the twin's tile shows " + read);
				}
			}
		}

		System.out.println(DashboardDemos.twins().size() + " twin(s): " + tiles + " tiles and " + claims
				+ " claims compared with their originals");
		assertTrue(wrong.isEmpty(), wrong.size() + " of " + tiles + " tiles and " + claims
				+ " claims differ:\n" + String.join("\n", wrong));
		if (!DashboardDemos.twins().isEmpty())
			assertTrue(tiles > 0 && claims > 0, "no tile of a twin was compared, which is not a pass");
	}

	/** Where a twin's rows first part from its original's, or null when they are the same. */
	static String difference(List<Map<String, Object>> want, List<Map<String, Object>> got) {
		if (want.size() != got.size())
			return "the original has " + want.size() + " rows, the twin " + got.size();
		for (int r = 0; r < want.size(); r++) {
			List<Object> left = new ArrayList<>(want.get(r).values());
			List<Object> right = new ArrayList<>(got.get(r).values());
			if (left.size() != right.size())
				return "row " + (r + 1) + ": the original has " + left.size() + " columns " + want.get(r).keySet()
						+ ", the twin " + right.size() + " " + got.get(r).keySet();
			for (int c = 0; c < left.size(); c++)
				if (!same(left.get(c), right.get(c)))
					return "row " + (r + 1) + ", column " + (c + 1) + ": the original has " + left.get(c)
							+ ", the twin " + right.get(c);
		}
		return null;
	}

	/**
	 * Two cells: a number the same at the precision a tile shows it (a cent, or a hundredth of a
	 * percent for a fraction under 1, which a tile shows as a percent), anything else as its text.
	 */
	static boolean same(Object a, Object b) {
		if (a == null || b == null)
			return a == b;
		if (a instanceof Number x && b instanceof Number y)
			return Math.abs(x.doubleValue() - y.doubleValue())
					<= (Math.abs(x.doubleValue()) < 1 ? HUNDREDTH_OF_A_PERCENT : CENT);
		return String.valueOf(a).equals(String.valueOf(b));
	}

	private static List<String> namesOf(List<Map<String, Object>> rows) {
		return rows.isEmpty() ? List.of() : new ArrayList<>(rows.get(0).keySet());
	}

	@SuppressWarnings("unchecked")
	private static List<Map<String, Object>> kpisOf(Map<String, Object> interaction) {
		Object kpis = interaction.get("kpis");
		return kpis instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
	}

	@Test
	@DisplayName("The comparison can fail: a cent's difference, a missing row and a renamed column are told apart")
	void theComparisonCanFail() {
		List<Map<String, Object>> want = List.of(Map.of("overdue_amount", 201234.56));
		assertEquals(null, difference(want, List.of(Map.of("OverdueAmount", 201234.561))));
		assertEquals("row 1, column 1: the original has 201234.56, the twin 201234.58",
				difference(want, List.of(Map.of("OverdueAmount", 201234.58))));
		assertEquals("the original has 1 rows, the twin 0", difference(want, List.of()));
		List<Map<String, Object>> share = List.of(Map.of("on_time_rate", 0.9333));
		assertEquals(null, difference(share, List.of(Map.of("OnTimePct", 0.93334))));
		assertEquals("row 1, column 1: the original has 0.9333, the twin 0.9334",
				difference(share, List.of(Map.of("OnTimePct", 0.9334))));
	}
}
