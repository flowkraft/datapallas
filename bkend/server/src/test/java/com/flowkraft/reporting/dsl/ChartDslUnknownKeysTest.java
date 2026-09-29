package com.flowkraft.reporting.dsl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

import com.flowkraft.reporting.dsl.chart.ChartOptions;
import com.flowkraft.reporting.dsl.chart.ChartOptionsParser;

/**
 * A chart-level key this DSL does not know is kept, and said out loud (D3's follow-up).
 *
 * <p>The defect was a chart that drew an empty axis: {@code title}, {@code xField} and
 * {@code yFields} were written at chart level, none of them is a keyword here, so all three went
 * into the Chart.js options - where Chart.js ignores them - and the chart was left with no dataset
 * at all. Everything about that was silent, which is the part these tests are about. The keys still
 * go where they went (a Chart.js property this DSL has never heard of is still a Chart.js property),
 * and parsing still succeeds: what is new is that the configuration now says what it is doing.
 *
 * <p>Made to go red: a parser that dropped the warnings would fail every assertion here; a parser
 * that turned them into an exception would fail {@link #theKeysAreStillKeptAndNothingFails()}; and a
 * shipped chart config that goes back to the D3 shape would fail
 * {@link #noShippedChartConfigUsesAKeyThisDslDoesNotKnow()}.
 */
class ChartDslUnknownKeysTest {

	/** Sample dashboards as they ship, read from the repo like the other sample tests. */
	private static final String SAMPLES_DIR = "../../asbl/src/main/external-resources/db-template/config/samples";

	/** The chart as D3 found it: three names, none of them a keyword, and no dataset. */
	private static final String AS_D3_FOUND_IT = String.join("\n",
			"chart('chart_channel_channel') {",
			"  type 'bar'",
			"  title 'Orders by Channel'",
			"  xField 'Channel'",
			"  yFields 'Orders'",
			"}");

	/** The same chart, written the way the DSL asks. */
	private static final String AS_THE_DSL_ASKS = String.join("\n",
			"chart('chart_channel_channel') {",
			"  type 'bar'",
			"  data {",
			"    labelField 'Channel'",
			"    datasets {",
			"      dataset { field 'Orders'; label 'Orders' }",
			"    }",
			"  }",
			"  options { plugins { title { display true; text 'Orders by Channel' } } }",
			"}");

	/**
	 * The chart that drew nothing now says why, in the words of the DSL it should have used.
	 */
	@Test
	void theChartThatDrewNothingSaysWhy() throws Exception {
		ChartOptions chart = named(AS_D3_FOUND_IT, "chart_channel_channel");

		assertEquals(List.of("title", "xField", "yFields"), keys(chart.getWarnings()),
				"one warning per chart-level name the DSL does not know, in the order they were written");
		for (Map<String, Object> warning : chart.getWarnings()) {
			assertEquals("warning", warning.get("level"), "never an error: the chart still renders");
			assertEquals("chart", warning.get("block"));
			assertEquals("chart_channel_channel", warning.get("chart"), "the chart it is about");
		}

		assertTrue(message(chart, "title").contains("options { plugins { title"),
				"the title warning says where a title goes: " + message(chart, "title"));
		assertTrue(message(chart, "xField").contains("data { labelField"),
				"the xField warning says where the labels come from: " + message(chart, "xField"));
		assertTrue(message(chart, "yFields").contains("dataset { field"),
				"the yFields warning says where the plotted columns go: " + message(chart, "yFields"));

		// And the reason the owner saw an empty axis, said by the parser rather than by a screenshot.
		assertTrue(chart.getDatasets().isEmpty(), "this is the config that has no dataset");
		assertTrue(message(chart, "yFields").contains("plots nothing"),
				"which the warning about yFields says in as many words");
	}

	/** A chart written the way the DSL asks says nothing at all. */
	@Test
	void aChartWrittenTheWayTheDslAsksSaysNothing() throws Exception {
		ChartOptions chart = named(AS_THE_DSL_ASKS, "chart_channel_channel");

		assertEquals(List.of(), keys(chart.getWarnings()), "nothing to say about a correct chart");
		assertEquals(1, chart.getDatasets().size(), "and it plots the column it names");
		assertEquals("Orders", chart.getDatasets().get(0).get("field"));
	}

	/**
	 * The keys are still kept, and parsing still succeeds.
	 *
	 * <p>This is the half that says the warning changed nothing: a Chart.js property this DSL has
	 * never heard of still arrives as a Chart.js option, so a chart that works today works
	 * tomorrow, and a mistake is a sentence rather than a broken dashboard.
	 */
	@Test
	void theKeysAreStillKeptAndNothingFails() throws Exception {
		ChartOptions chart = named(AS_D3_FOUND_IT, "chart_channel_channel");

		assertEquals("bar", chart.getType(), "the chart parsed");
		assertEquals("Orders by Channel", chart.getOptions().get("title"),
				"and the unknown key is where it has always been put");
		assertEquals("Channel", chart.getOptions().get("xField"));
		assertEquals("Orders", chart.getOptions().get("yFields"));
	}

	/** A name Chart.js may gain is kept, and mentioned once, in the general words. */
	@Test
	void aNameChartJsMayGainIsMentionedOnce() throws Exception {
		ChartOptions chart = named(String.join("\n",
				"chart('c') {",
				"  type 'line'",
				"  somePropertyChartJsGainsLater true",
				"}"), "c");

		assertEquals(List.of("somePropertyChartJsGainsLater"), keys(chart.getWarnings()));
		assertEquals(Boolean.TRUE, chart.getOptions().get("somePropertyChartJsGainsLater"),
				"kept, because that is what it is for");
		assertTrue(message(chart, "somePropertyChartJsGainsLater").contains("Chart.js option"),
				"and said plainly: " + message(chart, "somePropertyChartJsGainsLater"));
	}

	/** The unnamed form is read the same way. */
	@Test
	void theUnnamedChartFormIsReadTheSameWay() throws Exception {
		ChartOptions chart = ChartOptionsParser.parseGroovyChartDslCode(
				"chart {\n  type 'bar'\n  xField 'Channel'\n}");

		assertEquals(List.of("xField"), keys(chart.getWarnings()));
		assertEquals("", chart.getWarnings().get(0).get("chart"), "a chart with no id names none");
	}

	/**
	 * **Named assertion:** no chart DataPallas ships uses a key this DSL does not know.
	 *
	 * <p>The one that did is the one the owner opened (D3). This is the check that keeps every
	 * shipped dashboard on the right side of it, whoever writes the next one.
	 */
	@Test
	void noShippedChartConfigUsesAKeyThisDslDoesNotKnow() throws Exception {
		List<Path> configs;
		try (Stream<Path> walk = Files.walk(Paths.get(SAMPLES_DIR))) {
			configs = walk.filter(path -> path.getFileName().toString().endsWith("-chart-config.groovy"))
					.sorted().toList();
		}
		assertFalse(configs.isEmpty(), "the samples are where this test reads them: " + SAMPLES_DIR);

		for (Path config : configs) {
			ChartOptions chart = ChartOptionsParser.parseGroovyChartDslCode(Files.readString(config));
			assertEquals(List.of(), keys(chart.getWarnings()), config.getFileName() + " (unnamed chart)");
			for (Map.Entry<String, ChartOptions> named : chart.getNamedOptions().entrySet()) {
				assertEquals(List.of(), keys(named.getValue().getWarnings()),
						config.getFileName() + " / " + named.getKey());
			}
		}
	}

	// ── reading the answers ──────────────────────────────────────────────────

	private static ChartOptions named(String dsl, String id) throws Exception {
		ChartOptions parsed = ChartOptionsParser.parseGroovyChartDslCode(dsl);
		ChartOptions chart = parsed.getNamedOptions().get(id);
		return chart != null ? chart : parsed;
	}

	private static List<String> keys(List<Map<String, Object>> warnings) {
		return warnings.stream().map(warning -> String.valueOf(warning.get("key"))).toList();
	}

	private static String message(ChartOptions chart, String key) {
		return chart.getWarnings().stream()
				.filter(warning -> key.equals(warning.get("key")))
				.map(warning -> String.valueOf(warning.get("message")))
				.findFirst().orElse("");
	}
}
