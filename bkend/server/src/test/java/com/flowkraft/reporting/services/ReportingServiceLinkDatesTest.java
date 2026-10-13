package com.flowkraft.reporting.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.flowkraft.cubes.CubeDataToday;

/**
 * A relative date a link carries is a day before a published report's script reads it: the story
 * picture of DD12 (file 34 with E2E_DD_SCREENSHOTS=1) opened the dashboard with
 * dateTo={dataToday:minus 2 months, endOf month}, and every tile failed on the token.
 */
class ReportingServiceLinkDatesTest {

	private final AtomicInteger reads = new AtomicInteger();

	private ReportingService serviceWithTodayOn(LocalDate day) {
		ReportingService service = new ReportingService();
		service.useDataToday(new CubeDataToday() {
			@Override
			public LocalDate ofDashboards(String connectionId) {
				reads.incrementAndGet();
				return day;
			}
		});
		return service;
	}

	@Test
	void aLinksDatesAreDaysWhenTheScriptReadsThem() {
		Map<String, String> values = new LinkedHashMap<>();
		values.put("device", "mobile");
		values.put("dateFrom", "{dataToday:minus 3 months, startOf month}");
		values.put("dateTo", "{dataToday:minus 2 months, endOf month}");

		Map<String, String> read = serviceWithTodayOn(LocalDate.of(2026, 9, 30)).withRelativeDays(values,
				"rbt-sample-northwind-duckdb");

		assertEquals("mobile", read.get("device"));
		assertEquals("2026-06-01", read.get("dateFrom"));
		assertEquals("2026-07-31", read.get("dateTo"));
		assertEquals("{dataToday:minus 2 months, endOf month}", values.get("dateTo"), "the caller's map is left as it was");
	}

	@Test
	void valuesWithoutATokenReadNothing() {
		Map<String, String> values = new LinkedHashMap<>();
		values.put("dateFrom", "2026-06-01");
		values.put("country", "France");

		assertSame(values, serviceWithTodayOn(LocalDate.of(2026, 9, 30)).withRelativeDays(values, "any-connection"));
		assertEquals(0, reads.get(), "the data's today is read only when a value asks for it");
	}

	@Test
	void theReportsConnectionIsTheOneItsReportingXmlNames(@TempDir Path report) throws Exception {
		Files.writeString(report.resolve("reporting.xml"),
				"<documentburster><report><datasource><sqloptions><conncode>rbt-sample-northwind-duckdb</conncode>"
						+ "</sqloptions></datasource></report></documentburster>");

		ReportingService service = new ReportingService();
		assertEquals("rbt-sample-northwind-duckdb", service.connectionCodeOf(report.resolve("settings.xml").toString()));
		assertNull(service.connectionCodeOf(report.resolve("other").resolve("settings.xml").toString()));
	}
}
