package com.flowkraft.embed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.flowkraft.reporting.dtos.ReportFullConfigDto;
import com.flowkraft.reporting.services.ReportingService;
import com.sourcekraft.documentburster.common.reportparameters.ReportParameter;

/**
 * What may be locked, and with what value.
 *
 * <p>The case that matters most is the typo. A lock on {@code regoin} would be stored happily, shown
 * in the links table, and restrict nothing at all — the override would put a value into the query map
 * that the report's query never reads. Nobody opens a share link again to check, so the only moment
 * that mistake can be caught is here, while the link is being created.
 */
class LockedParamsValidatorTest {

	private static final String REPORT = "sales-summary";

	private ReportingService reportingService;
	private LockedParamsValidator validator;

	@BeforeEach
	void setUp() throws Exception {
		reportingService = mock(ReportingService.class);

		ReportFullConfigDto config = new ReportFullConfigDto();
		config.parameters = List.of(
				parameter("region", "String", Map.of("pattern", "[A-Z]{2}")),
				parameter("country", "String", Map.of()),
				parameter("year", "Integer", Map.of("min", 2000, "max", 2030)),
				parameter("since", "Date", Map.of()));

		when(reportingService.loadReportConfig(REPORT)).thenReturn(config);

		validator = new LockedParamsValidator();
		ReflectionTestUtils.setField(validator, "reportingService", reportingService);
	}

	private static ReportParameter parameter(String id, String type, Map<String, Object> constraints) {
		ReportParameter parameter = new ReportParameter();
		parameter.id = id;
		parameter.type = type;
		parameter.constraints = new LinkedHashMap<>(constraints);
		return parameter;
	}

	@Test
	void aDeclaredParameterIsLockedToItsValue() {

		Map<String, Object> locked = validator.validate(REPORT, Map.of("region", "EU"));

		assertEquals(Map.of("region", "EU"), locked);
	}

	/** The typo. It must fail loudly rather than produce a link that looks locked and is not. */
	@Test
	void aParameterTheReportDoesNotDeclareIsRefusedByName() {

		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> validator.validate(REPORT, Map.of("regoin", "EU")));

		assertEquals("Report 'sales-summary' has no parameter 'regoin'", refused.getMessage());
	}

	/** A multi-value parameter locks to several values, each checked like a single one. */
	@Test
	void aListOfValuesIsKeptAsAList() {

		List<String> values = new ArrayList<>(List.of("EU", "US"));

		Map<String, Object> locked = validator.validate(REPORT, Map.of("region", values));

		assertEquals(List.of("EU", "US"), locked.get("region"));
	}

	@Test
	void oneBadValueInAListRefusesTheWholeLock() {
		assertThrows(IllegalArgumentException.class,
				() -> validator.validate(REPORT, Map.of("region", List.of("EU", "europe"))));
	}

	/** The report's own constraints apply: a locked value it would have rejected is a broken link. */
	@Test
	void aValueThatFailsTheReportsConstraintsIsRefused() {

		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> validator.validate(REPORT, Map.of("region", "europe")));

		assertTrue(refused.getMessage().contains("region"), refused.getMessage());
	}

	@Test
	void anIntegerParameterOnlyLocksToAWholeNumber() {

		assertEquals(Map.of("year", "2024"), validator.validate(REPORT, Map.of("year", "2024")));

		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> validator.validate(REPORT, Map.of("year", "last")));
		assertTrue(refused.getMessage().contains("whole number"), refused.getMessage());

		// Out of the range the report itself declares.
		assertThrows(IllegalArgumentException.class, () -> validator.validate(REPORT, Map.of("year", "1999")));
	}

	@Test
	void aDateParameterOnlyLocksToADate() {

		assertEquals(Map.of("since", "2026-01-31"), validator.validate(REPORT, Map.of("since", "2026-01-31")));

		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> validator.validate(REPORT, Map.of("since", "31/01/2026")));
		assertTrue(refused.getMessage().contains("yyyy-MM-dd"), refused.getMessage());
	}

	/** A parameter that declares no constraints takes whatever the author typed. */
	@Test
	void aParameterWithoutConstraintsAcceptsAnyText() {
		assertEquals(Map.of("country", "Côte d'Ivoire"), validator.validate(REPORT, Map.of("country", "Côte d'Ivoire")));
	}

	@Test
	void lockingNothingIsNotAnError() {
		assertTrue(validator.validate(REPORT, null).isEmpty());
		assertTrue(validator.validate(REPORT, Map.of()).isEmpty());
	}

	@Test
	void somethingThatIsNotAnObjectIsRefused() {
		assertThrows(IllegalArgumentException.class, () -> validator.validate(REPORT, "region=EU"));
		assertThrows(IllegalArgumentException.class, () -> validator.validate(REPORT, List.of("region")));
	}

	/**
	 * A report with no parameters spec declares nothing, so nothing about it can be locked — the same
	 * answer as a misspelled name, because from the caller's side it is the same mistake.
	 */
	@Test
	void aReportThatDeclaresNoParametersCanLockNothing() throws Exception {

		when(reportingService.loadReportConfig("canvas-export")).thenReturn(new ReportFullConfigDto());

		assertThrows(IllegalArgumentException.class,
				() -> validator.validate("canvas-export", Map.of("region", "EU")));
	}

	@Test
	void aReportWhoseSpecCannotBeReadIsRefused() throws Exception {

		when(reportingService.loadReportConfig(anyString())).thenThrow(new IllegalStateException("no such report"));

		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> validator.validate("missing", Map.of("region", "EU")));

		assertTrue(refused.getMessage().contains("missing"), refused.getMessage());
	}
}
