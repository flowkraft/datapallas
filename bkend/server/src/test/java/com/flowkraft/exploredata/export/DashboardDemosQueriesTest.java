package com.flowkraft.exploredata.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;

import com.flowkraft.cubes.CubeDates;
import com.flowkraft.exploredata.export.DashboardDemos.Demo;

/**
 * Every claim the Dashboard Demos make is the number the tile that makes it shows a reader.
 *
 * <h2>Why this is a test and not a reading</h2>
 * A demo's whole job is to be true. Its finding is printed on the page, its stories tell a reader
 * what to click and what they will then see, and Phase D's docs pages quote the same numbers. All of
 * those come from one place - the demo's {@code checks.json} - and nothing so far has held the page
 * to it: the numbers were measured by a generator that wrote its own SQL beside each claim, and a
 * dashboard that quietly showed something else would still read well.
 *
 * <p>So this case runs the dashboard. For each demo it assembles the script the product publishes
 * for that canvas, evaluates it on the frozen {@code dash_demo} rows with the reader's answers
 * bound, and compares what each tile was handed with what the claim says the tile shows - at the
 * defaults, and again under every interaction the catalogue lists. Nothing here re-implements the
 * dashboard's rules: the empty-value rule, the day a date range ends at and the typed binds are
 * applied by {@link ScriptAssembler} and by the runtime's own {@code ctx}.
 *
 * <p>What it therefore catches: a tile whose SQL drifted from the claim beside it, a filter that
 * does not reach a tile it is drawn on, a claim named after a widget the canvas does not have, a
 * percent tile that holds a percent where the component writes one (the number would double), and a
 * story that promises a number its demo does not show.
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class DashboardDemosQueriesTest {

	/** How many demos ship. Named so a lost canvas is a failure, not a quietly shorter run. */
	private static final int DEMOS = 25;

	/** The day the frozen rows are today, which is what a story's relative dates mean. */
	private static final LocalDate DAY = LocalDate.parse(DashboardDemos.DASH_DEMO_TODAY);

	@Test
	@Order(1)
	@DisplayName("The 25 demos are all there, each with its canvas and its checks")
	void theTwentyFiveAreAllThere() throws Exception {

		List<Demo> demos = DashboardDemos.all();
		assertEquals(DEMOS, demos.size(), "the index lists every demo that ships");

		List<String> order = new ArrayList<>();
		for (Demo demo : demos) {
			order.add(demo.nn() + " " + demo.reportId());
			assertEquals("g-" + demo.id(), demo.reportId(),
					"a demo's report id is g- and its id, which is how the Gallery names it");
			assertEquals(DashboardDemos.DASH_DEMO_TODAY, Objects.toString(demo.checks().get("dataToday"), ""),
					demo.reportId() + " was measured on the day the data is frozen on");
			assertFalse(demo.widgets().isEmpty(), demo.reportId() + " has no widget at all");
			assertFalse(demo.kpis().isEmpty(), demo.reportId() + " claims nothing");
		}
		for (int i = 0; i < demos.size(); i++)
			assertEquals(i + 1, demos.get(i).nn(), "the index is in Gallery order: " + order);
	}

	@Test
	@Order(2)
	@DisplayName("Every tile shows the number its claim says it shows, at the defaults and under every interaction")
	void everyTileShowsWhatItsClaimSays() throws Exception {

		Connection connection = DashboardDemos.dashDemo();
		List<String> wrong = new ArrayList<>();
		int claims = 0;

		for (Demo demo : DashboardDemos.all()) {

			// The defaults first: what a reader sees when the page opens.
			claims += read(demo, "defaults", demo.kpis(), connection, wrong);

			// Then each interaction, with every claim the catalogue re-evaluated under it.
			for (Map<String, Object> interaction : demo.interactions()) {
				String id = Objects.toString(interaction.get("id"), "");
				claims += read(demo, id, kpisOf(interaction), connection, wrong);
			}
		}

		assertTrue(claims > 0, "no claim was read at all, which is not a pass");
		assertTrue(wrong.isEmpty(), wrong.size() + " of " + claims
				+ " claims are not what their tile shows:\n" + String.join("\n", wrong));
	}

	@Test
	@Order(3)
	@DisplayName("Every story a demo ships is one of its interactions, and its numbers are that interaction's")
	void everyStoryIsAnInteractionOfItsOwnDemo() throws Exception {

		Connection connection = DashboardDemos.dashDemo();
		List<String> wrong = new ArrayList<>();
		int stories = 0;

		for (Demo demo : DashboardDemos.all()) {
			List<String> declared = new ArrayList<>();
			for (Map<String, Object> parameter : demo.parameters())
				declared.add(Objects.toString(parameter.get("id"), ""));

			for (Map<String, Object> story : demo.stories()) {
				stories++;
				String id = Objects.toString(story.get("id"), "");
				String where = demo.reportId() + " story '" + id + "'";

				for (String field : List.of("id", "question", "text", "check"))
					assertFalse(Objects.toString(story.get(field), "").isBlank(),
							where + " has no " + field);

				// Show Me sets this demo's own filters, so every name it sets is one it declares.
				Object params = story.get("params");
				assertTrue(params instanceof Map<?, ?>, where + " has no params block");
				for (Object name : ((Map<?, ?>) params).keySet())
					assertTrue(declared.contains(String.valueOf(name)),
							where + " sets '" + name + "', which this demo does not declare: " + declared);

				// Its check names an interaction of its own demo, and what the reader is promised is
				// what that interaction's claims say - read off the running dashboard. A story whose
				// move is not a filter at all - sorting a table by another column - names the
				// defaults instead, and then it sets nothing, because there is nothing for Show Me
				// to click: what it promises is what the page shows as it stands.
				String check = Objects.toString(story.get("check"), "");
				if ("defaults".equals(check)) {
					assertTrue(mapOf(params).isEmpty(),
							where + " reads the page at its defaults, so it sets no filter: " + params);
					read(demo, "defaults", demo.kpis(), connection, wrong);
				} else {
					Map<String, Object> interaction = demo.interaction(check);
					read(demo, check, kpisOf(interaction), connection, wrong);

					// And the values the story sets are the ones that interaction moves, so "Show Me"
					// and the numbers beside it cannot drift apart. Compared over what the interaction
					// CHANGES from the defaults, and over this demo's own filters: the interaction
					// also carries the filters it leaves alone, and sometimes a value the claim SQL
					// needed for a label, which is nothing a reader can set and nothing Show Me has to.
					assertEquals(moves(demo, mapOf(interaction.get("changed")), declared),
							moves(demo, mapOf(params), declared),
							where + " sets values the interaction it names does not move");
				}
			}
		}
		assertTrue(stories > 0, "not one demo ships a story");
		assertTrue(wrong.isEmpty(), "a story promises a number its demo does not show:\n"
				+ String.join("\n", wrong));
	}

	@Test
	@Order(4)
	@DisplayName("Every value a story sets is one its own filter offers, and its dates stay true")
	void everyStoryValueIsOneItsFilterOffers() throws Exception {

		Connection connection = DashboardDemos.dashDemo();
		List<String> wrong = new ArrayList<>();
		int values = 0;

		for (Demo demo : DashboardDemos.all()) {
			Map<String, Map<String, Object>> filters = new LinkedHashMap<>();
			for (Map<String, Object> parameter : demo.parameters())
				filters.put(Objects.toString(parameter.get("id"), ""), parameter);

			for (Map<String, Object> story : demo.stories())
				for (Map.Entry<String, Object> set : mapOf(story.get("params")).entrySet()) {
					String where = demo.reportId() + " story '" + Objects.toString(story.get("id"), "")
							+ "' sets " + set.getKey() + " to " + set.getValue();
					Map<String, Object> filter = filters.get(set.getKey());
					if (filter == null) {
						wrong.add(where + ", and this demo has no such filter");
						continue;
					}
					for (String one : each(set.getValue())) {
						values++;
						wrong.addAll(offered(filter, one, where, connection));
					}
				}
		}

		assertTrue(values > 0, "not one story sets a filter");
		assertTrue(wrong.isEmpty(), "a story sets a value its own filter does not offer:\n"
				+ String.join("\n", wrong));
	}

	@Test
	@Order(5)
	@DisplayName("A claim read off the wrong tile goes red")
	void aClaimReadOffTheWrongTileGoesRed() throws Exception {

		// The assertion above is worth having only if it can fail. A demo's own claim, moved by one
		// tile: DD01's revenue claim read off the orders tile is a different number, and this is what
		// the loop says about it.
		Connection connection = DashboardDemos.dashDemo();
		Demo demo = DashboardDemos.all().get(0);

		Map<String, Object> claim = new LinkedHashMap<>(demo.kpis().get(0));
		claim.put("value", ((Number) claim.get("value")).doubleValue() + 1000);

		List<String> wrong = new ArrayList<>();
		read(demo, "defaults", List.of(claim), connection, wrong);
		assertEquals(1, wrong.size(), "a claim that is out by 1000 is not what the tile shows");
		assertTrue(wrong.get(0).contains(demo.reportId()), wrong.get(0));
	}

	// ── The harness ──────────────────────────────────────────────────────────────

	/** Reads every claim of one demo under one set of answers, and says which ones do not hold. */
	private static int read(Demo demo, String interactionId, List<Map<String, Object>> kpis,
			Connection connection, List<String> wrong) throws Exception {

		if (kpis.isEmpty())
			return 0;

		Map<String, Object> params = demo.paramsOf(interactionId);
		Map<String, List<Map<String, Object>>> reported = DashboardDemos.answers(demo, params, connection);

		for (Map<String, Object> kpi : kpis) {
			String key = Objects.toString(kpi.get("widget"), "");
			Map<String, Object> widget = demo.widget(key);
			String componentId = DashboardDemos.componentIdOf(widget);
			List<Map<String, Object>> rows = reported.get(componentId);
			if (rows == null) {
				wrong.add(demo.reportId() + " / " + interactionId + " / " + key + ": the tile was never"
						+ " asked - the dashboard reported " + reported.keySet());
				continue;
			}
			Object want = kpi.get("value");
			Object got = DashboardDemos.reading(widget, rows, kpi);
			if (!DashboardDemos.shows(want, got))
				wrong.add(demo.reportId() + " / " + interactionId + " / " + key + " ("
						+ Objects.toString(kpi.get("label"), "") + "): the claim says " + want
						+ ", the tile shows " + got);
		}
		return kpis.size();
	}

	@SuppressWarnings("unchecked")
	private static List<Map<String, Object>> kpisOf(Map<String, Object> interaction) {
		Object kpis = interaction.get("kpis");
		return kpis instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
	}

	/** The filters of this demo that these values name: what a reader can actually set. */
	/**
	 * What a set of values actually moves on this demo: the filters it names, minus the ones it
	 * leaves where the page already had them. An interaction's {@code changed} block carries a
	 * value the claim SQL needed for a label, which is nothing a reader can set, and it can also
	 * carry a filter it wrote out in full at the value the demo already defaults to - a story has
	 * nothing to click for either, so neither counts as a move.
	 */
	private static Map<String, String> moves(Demo demo, Map<String, Object> values,
			List<String> declared) {
		Map<String, String> defaults = DashboardDemos.userVariables(demo.defaults());
		Map<String, Object> kept = new LinkedHashMap<>();
		for (Map.Entry<String, Object> one : values.entrySet()) {
			if (!declared.contains(one.getKey()))
				continue;
			Map<String, String> asText = DashboardDemos.userVariables(Map.of(one.getKey(),
					one.getValue() == null ? "" : one.getValue()));
			if (day(asText.get(one.getKey())).equals(day(defaults.get(one.getKey()))))
				continue;
			kept.put(one.getKey(), one.getValue());
		}
		Map<String, String> asText = new LinkedHashMap<>();
		for (Map.Entry<String, String> one : DashboardDemos.userVariables(kept).entrySet())
			asText.put(one.getKey(), day(one.getValue()));
		return asText;
	}

	/**
	 * One value as the day it means. A story writes its dates relative to the data's own today
	 * (section 8), because the demo data is shifted to the day it is installed; the checks measured
	 * the interaction on the day the rows are frozen on and wrote that day out. So the two are the
	 * same value, and this is where they are read as one. Anything that is not a relative date is
	 * returned as it stands.
	 */
	private static String day(String value) {
		return value == null ? "" : CubeDates.resolve(value, DAY);
	}

	/** One value a story sets, or each value of a multiselect's list. */
	private static List<String> each(Object value) {
		List<String> items = new ArrayList<>();
		if (value instanceof List<?> list)
			for (Object item : list)
				items.add(Objects.toString(item, ""));
		else
			items.add(Objects.toString(value, ""));
		return items;
	}

	/**
	 * What is wrong with one value a story sets, held to the filter's own spec.
	 *
	 * <p>A date is written the way the filter's default is written - relative to the data's today,
	 * never as a fixed day - because the demo data is shifted to the day it is installed and a story
	 * that named a day would stop being true (section 8). Every other value is one the filter really
	 * offers: where the filter is built from a query or a list of options, the value is one of them,
	 * asked of the frozen rows; where a reader types it, it is of the type the filter declares.
	 */
	private static List<String> offered(Map<String, Object> filter, String value, String where,
			Connection connection) throws Exception {

		String type = Objects.toString(filter.get("type"), "String");

		if ("Date".equals(type)) {
			if (!CubeDates.mentions(value))
				return List.of(where + ": a story writes a date the way the filter's own default is"
						+ " written, relative to the data's today (" + filter.get("defaultValue")
						+ "), so it is still that period after the date shift");
			try {
				LocalDate.parse(day(value));
			} catch (DateTimeParseException notADay) {
				return List.of(where + ", which is no day at all: " + notADay.getMessage());
			}
			return List.of();
		}

		Set<String> options = options(filter, connection);
		if (options != null)
			return options.contains(value) ? List.of()
					: List.of(where + ", and its filter offers " + options);

		if (value.isBlank())
			return List.of(where + ", which is nothing at all");
		try {
			switch (type) {
			case "Integer":
				Long.parseLong(value);
				break;
			case "Double":
				Double.parseDouble(value);
				break;
			case "Boolean":
				if (!"true".equals(value) && !"false".equals(value))
					throw new NumberFormatException(value);
				break;
			default:
				break;
			}
		} catch (NumberFormatException notTheType) {
			return List.of(where + ", which is not the " + type + " this filter takes");
		}
		return List.of();
	}

	/**
	 * The values this filter offers a reader, or null where it offers no list at all and the reader
	 * types the value. A filter is built either from a query over the data, asked here as the filter
	 * bar asks it, or from options written out in the canvas.
	 */
	@SuppressWarnings("unchecked")
	private static Set<String> options(Map<String, Object> filter, Connection connection)
			throws Exception {

		Object hints = filter.get("uiHints");
		Object options = hints instanceof Map<?, ?> map ? ((Map<String, Object>) map).get("options") : null;
		Set<String> offered = new LinkedHashSet<>();

		if (options instanceof List<?> written) {
			for (Object one : written)
				offered.add(one instanceof Map<?, ?> option
						? Objects.toString(((Map<String, Object>) option).get("value"), "")
						: Objects.toString(one, ""));
			return offered;
		}
		if (!(options instanceof String sql) || sql.isBlank())
			return null;

		try (Statement statement = connection.createStatement();
				ResultSet answer = statement.executeQuery(sql)) {
			while (answer.next())
				offered.add(Objects.toString(answer.getString(1), ""));
		}
		return offered;
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> mapOf(Object value) {
		return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
	}
}
