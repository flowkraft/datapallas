package com.flowkraft.reporting.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.flowkraft.cubes.CubeDataToday;

/**
 * A request that comes without a required filter's value runs with the filter's default.
 *
 * <p>The published script writes a required filter's lines with no "off" version, so the value
 * has to be there. A tile of DD01 asking before the filter bar had set its year, and the Gallery
 * opening a demo, sent none, and every tile failed. The default is what the filter bar opens on,
 * so it is what such a request means; a required filter with neither is refused by name.
 */
class ReportingServiceRequiredFiltersTest {

	private static final String SPEC = """
			reportParameters {
			  parameter(id: 'year', type: 'Date', label: 'Year', defaultValue: '{dataToday:startOf year}') {
			    constraints(required: true)
			  }
			  parameter(id: 'country', type: 'String', label: 'Country', defaultValue: 'France') {
			  }
			}
			""";

	@TempDir
	Path report;

	private Path spec(String dsl) throws Exception {
		Path spec = report.resolve("r-report-parameters-spec.groovy");
		Files.writeString(spec, dsl);
		return spec;
	}

	@Test
	void aRequiredFilterLeftOutOrEmptyIsItsDefault() throws Exception {
		Path spec = spec(SPEC);
		ReportingService service = new ReportingService();

		Map<String, String> none = new LinkedHashMap<>();
		none.put("componentId", "kpi_revenue");
		Map<String, String> filled = service.withRequiredValues(none, spec);
		assertEquals("{dataToday:startOf year}", filled.get("year"), "left out: its default, still a token");
		assertEquals("kpi_revenue", filled.get("componentId"));
		assertFalse(none.containsKey("year"), "the caller's map is left as it was");

		assertEquals("{dataToday:startOf year}", service.withRequiredValues(Map.of("year", ""), spec).get("year"),
				"empty: its default");

		Map<String, String> given = Map.of("year", "2025-01-01");
		assertSame(given, service.withRequiredValues(given, spec), "a value the request has is the value");
	}

	@Test
	void anOptionalFilterWithNoValueIsLeftOff() throws Exception {
		Map<String, String> filled = new ReportingService().withRequiredValues(Map.of("year", "2025-01-01", "country", ""),
				spec(SPEC));
		assertEquals("", filled.get("country"), "empty means off, not France");
		assertFalse(new ReportingService().withRequiredValues(Map.of("year", "2025-01-01"), spec(SPEC))
				.containsKey("country"), "left out stays left out");
	}

	@Test
	void theDefaultsDayIsResolvedLikeAnyOtherRelativeDate() throws Exception {
		ReportingService service = new ReportingService();
		service.useDataToday(new CubeDataToday() {
			@Override
			public LocalDate ofDashboards(String connectionId) {
				return LocalDate.of(2026, 9, 30);
			}
		});
		Map<String, String> filled = service.withRequiredValues(Map.of(), spec(SPEC));
		assertEquals("2026-01-01", service.withRelativeDays(filled, "any-connection").get("year"));
	}

	@Test
	void aRequiredFilterWithNoDefaultAndNoValueIsRefusedByName() throws Exception {
		Path spec = spec("""
				reportParameters {
				  parameter(id: 'region', type: 'String', label: 'Sales region') {
				    constraints(required: true)
				  }
				}
				""");
		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> new ReportingService().withRequiredValues(Map.of(), spec));
		assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
		assertTrue(refused.getReason().contains("'Sales region' is required"), refused.getReason());
	}

	@Test
	void aReportWithNoSpecOrNoRequiredFilterRunsAsItCame() throws Exception {
		Map<String, String> values = Map.of("country", "");
		assertSame(values, new ReportingService().withRequiredValues(values, report.resolve("none-report-parameters-spec.groovy")));
		assertSame(values, new ReportingService().withRequiredValues(values, spec("""
				reportParameters {
				  parameter(id: 'country', type: 'String', label: 'Country') {
				  }
				}
				""")));
	}

	@Test
	void aSpecIsReadAgainWhenItChanges() throws Exception {
		ReportingService service = new ReportingService();
		Path spec = spec(SPEC);
		assertEquals("{dataToday:startOf year}", service.withRequiredValues(Map.of(), spec).get("year"));

		Files.writeString(spec, SPEC.replace("{dataToday:startOf year}", "2024-01-01"));
		Files.setLastModifiedTime(spec, FileTime.fromMillis(Files.getLastModifiedTime(spec).toMillis() + 5_000));
		assertEquals("2024-01-01", service.withRequiredValues(Map.of(), spec).get("year"));
	}

	@Test
	void fetchDataReadsTheSpecBesideTheReportsSettings() throws Exception {
		// The folder is the report's code, and its spec is named after it.
		Path folder = report.resolve("g-dd-sample");
		assertEquals(folder.resolve("g-dd-sample-report-parameters-spec.groovy").toAbsolutePath(),
				new ReportingService().specBeside(folder.resolve("settings.xml").toString()));
	}
}
