package com.flowkraft.exploredata.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

/**
 * A data widget's title and subtitle (#23) are the first lines of its published tile, as typed and
 * escaped; a widget with neither, and a layout piece, are written exactly as before. A divider is a
 * line between tiles, with no card behind it.
 */
class WidgetHeadingExportTest {

	private static Map<String, Object> widget(String type, Map<String, Object> displayConfig) {
		Map<String, Object> dataSource = new LinkedHashMap<>();
		dataSource.put("mode", "sql");
		dataSource.put("sql", "SELECT channel, COUNT(*) AS n FROM orders GROUP BY channel");
		Map<String, Object> widget = new LinkedHashMap<>();
		widget.put("id", "w-heading-1");
		widget.put("type", type);
		widget.put("dataSource", dataSource);
		widget.put("gridPosition", Map.of("x", 0, "y", 0, "w", 6, "h", 4));
		widget.put("displayConfig", displayConfig);
		return widget;
	}

	private static String templateOf(Map<String, Object> widget) throws Exception {
		return DashboardFileGenerator.generate(List.of(widget), List.of(), "e2e-heading", "http://localhost:9090/api",
				"conn").templateHtml();
	}

	@Test
	void a_titled_chart_opens_its_tile_with_the_title_and_the_subtitle() throws Exception {
		String template = templateOf(widget("chart",
				Map.of("widgetTitle", "Orders by channel", "widgetSubtitle", "All orders, this year")));
		int start = template.indexOf("<div class=\"grid-item rb-chart-tile\"");
		int end = template.indexOf("</rb-chart>", start);
		assertTrue(start >= 0 && end > start, template);
		String tile = template.substring(start, end);
		Matcher heading = Pattern.compile("<div class=\"grid-item rb-chart-tile\"[^>]*>\\n"
				+ "\\s*<div class=\"rb-tile-title\" id=\"tileTitle-[^\"]+\"[^>]*>Orders by channel</div>\\n"
				+ "\\s*<div class=\"rb-tile-subtitle\" id=\"tileSubtitle-[^\"]+\"[^>]*>All orders, this year</div>\\n"
				+ "\\s*<rb-chart fill-height ").matcher(tile);
		assertTrue(heading.lookingAt(), tile);
	}

	@Test
	void what_is_typed_is_shown_never_run() throws Exception {
		String template = templateOf(widget("tabulator", Map.of("widgetTitle", "<b>Top</b> & \"best\"")));
		assertTrue(template.contains(">&lt;b&gt;Top&lt;/b&gt; &amp; &quot;best&quot;</div>"), template);
		assertFalse(template.contains("<b>Top</b>"));
		assertFalse(template.contains("tileSubtitle-"), "no subtitle typed, no subtitle line");
	}

	@Test
	void a_widget_with_no_heading_is_written_as_before() throws Exception {
		String none = templateOf(widget("chart", Map.of()));
		assertFalse(none.contains("rb-tile-title"));
		assertEquals(none, templateOf(widget("chart", Map.of("widgetTitle", "  ", "widgetSubtitle", ""))),
				"blank: the same bytes");
	}

	@Test
	void the_words_for_no_rows_ride_on_the_tile() throws Exception {
		String template = templateOf(widget("tabulator", Map.of("noDataMessage", "No \"orders\" yet")));
		assertTrue(template.contains("<div class=\"grid-item\" data-no-data=\"No &quot;orders&quot; yet\" style=\""), template);
		assertFalse(templateOf(widget("tabulator", Map.of())).contains("data-no-data"), "none set, none written");
	}

	@Test
	void a_layout_piece_has_no_heading() throws Exception {
		assertFalse(templateOf(widget("divider", Map.of("widgetTitle", "Section"))).contains("rb-tile-title"));
	}

	@Test
	void a_divider_is_a_line_between_tiles_not_an_empty_card() throws Exception {
		String template = templateOf(widget("divider", Map.of()));
		Matcher tile = Pattern.compile("<div class=\"grid-item rb-divider-tile\" style=\"([^\"]*)\">\\s*<hr class=\"divider\"")
				.matcher(template);
		assertTrue(tile.find(), template);
		assertTrue(tile.group(1).contains("background: transparent") && tile.group(1).contains("border: none")
				&& tile.group(1).contains("padding: 0"), "no card behind the line: " + tile.group(1));
	}
}
