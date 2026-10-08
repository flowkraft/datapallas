package com.flowkraft.reporting.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.cubes.CubeDataToday;

/**
 * A story's relative dates are days by the time the dashboard's configuration is served: Show Me
 * hands them to a select that only accepts its own options (file 9, DD01 'year-2025').
 */
class ReportingServiceStoryParamsTest {

	private final AtomicInteger reads = new AtomicInteger();

	private ReportingService serviceWithTodayOn(LocalDate day) {
		ReportingService service = new ReportingService();
		service.useDataToday(new CubeDataToday() {
			@Override
			public LocalDate of(String connectionId) {
				reads.incrementAndGet();
				return day;
			}
		});
		return service;
	}

	@Test
	void aStoryWritesItsDatesAsDays() throws Exception {
		JsonNode stories = new ObjectMapper().readTree("[{\"id\":\"year-2025\",\"params\":{"
				+ "\"year\":\"{dataToday:minus 1 year, startOf year}\",\"country\":\"Germany\"}},"
				+ "{\"id\":\"window\",\"params\":{\"dateFrom\":\"{dataToday:minus 3 months, startOf month}\","
				+ "\"dateTo\":\"{dataToday}\"}},{\"id\":\"no-values\"}]");

		serviceWithTodayOn(LocalDate.of(2026, 9, 30)).resolveRelativeStoryParams(stories, "any-connection");

		assertEquals("2025-01-01", stories.get(0).get("params").get("year").asText());
		assertEquals("Germany", stories.get(0).get("params").get("country").asText());
		assertEquals("2026-06-01", stories.get(1).get("params").get("dateFrom").asText());
		assertEquals("2026-09-30", stories.get(1).get("params").get("dateTo").asText());
	}

	@Test
	void aStoryWithoutATokenReadsNothing() throws Exception {
		JsonNode stories = new ObjectMapper().readTree("[{\"id\":\"a\",\"params\":{\"country\":\"France\"}}]");
		JsonNode before = stories.deepCopy();

		serviceWithTodayOn(LocalDate.of(2026, 9, 30)).resolveRelativeStoryParams(stories, "any-connection");

		assertEquals(before, stories);
		assertEquals(0, reads.get(), "the data's today is read only when a story asks for it");
		assertSame(stories, stories);
	}
}
