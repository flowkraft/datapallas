package com.sourcekraft.documentburster.common.reportparameters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * A multi-select's value is a comma-separated string. A list written as its default must reach the
 * filter bar as that string - not as the list's own text, which a report script reads as a value
 * (file 9, DD02: {@code channel=[]} matched no row and every chart came back empty).
 */
class ReportParametersListDefaultTest {

	private static String defaultOf(String declaration) throws Exception {
		List<ReportParameter> parsed = ReportParametersHelper.parseGroovyParametersDslCode(
				"reportParameters {\n  parameter(id: 'p', type: 'String', label: 'P'" + declaration + ")\n}\n");
		return parsed.get(0).defaultValue;
	}

	@Test
	void anEmptyListIsNoValue() throws Exception {
		assertEquals("", defaultOf(", defaultValue: []"));
	}

	@Test
	void aListIsItsValuesSeparatedByCommas() throws Exception {
		assertEquals("web,sales_rep", defaultOf(", defaultValue: ['web', 'sales_rep']"));
	}

	@Test
	void aPlainDefaultIsUnchangedAndNoDefaultStaysNone() throws Exception {
		assertEquals("2025-01-01", defaultOf(", defaultValue: '2025-01-01'"));
		assertNull(defaultOf(""));
	}
}
