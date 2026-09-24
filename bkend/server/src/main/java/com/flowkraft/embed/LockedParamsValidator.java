package com.flowkraft.embed;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.flowkraft.reporting.services.ReportingService;
import com.sourcekraft.documentburster.common.reportparameters.ParameterValidator;
import com.sourcekraft.documentburster.common.reportparameters.ReportParameter;
import com.sourcekraft.documentburster.common.reportparameters.ValidationException;

/**
 * Checks the locks asked for when a share link or an embed token is created.
 *
 * <h2>Why creation is the place to refuse</h2>
 * A lock that names a parameter the report does not declare cannot restrict anything: the override
 * puts a value into the query map, the report's query never reads it, and the link shows every row.
 * A typo — {@code regoin} for {@code region} — would therefore produce a link that looks locked and
 * is not. That is the one failure mode worth being loud about, and the only moment it can be caught
 * is while the link is being created, because afterwards nobody looks at it again.
 *
 * <p>The values go through the same {@link ParameterValidator} a viewer's submission does. A locked
 * value that the report itself would have rejected is a broken link, not a safer one.
 */
@Component
public class LockedParamsValidator {

	@Autowired
	private ReportingService reportingService;

	/**
	 * @param raw the {@code lockedParams} object as it arrived in the request body: parameter names
	 *            mapped to a value, or to a list of values for a multi-value parameter
	 * @return the locks to store, normalised to strings and lists of strings, never null
	 * @throws IllegalArgumentException when a name is not a declared parameter or a value does not
	 *                                  pass the report's own validation. The callers turn this into a
	 *                                  400, and nothing is created.
	 */
	public Map<String, Object> validate(String reportId, Object raw) {

		if (raw == null)
			return Map.of();

		if (!(raw instanceof Map<?, ?> requested))
			throw new IllegalArgumentException("lockedParams must be an object of parameter names and values");

		if (requested.isEmpty())
			return Map.of();

		Map<String, ReportParameter> declared = declaredParameters(reportId);
		Map<String, Object> locked = new LinkedHashMap<>();

		for (Map.Entry<?, ?> entry : requested.entrySet()) {

			String name = String.valueOf(entry.getKey());
			ReportParameter parameter = declared.get(name);

			if (parameter == null)
				throw new IllegalArgumentException("Report '" + reportId + "' has no parameter '" + name + "'");

			locked.put(name, checkedValue(parameter, entry.getValue()));
		}

		return locked;
	}

	// ============================================================
	// internals
	// ============================================================

	private Map<String, ReportParameter> declaredParameters(String reportId) {

		List<ReportParameter> parameters;
		try {
			parameters = reportingService.loadReportConfig(reportId).parameters;
		} catch (Exception e) {
			// Deliberately the same answer as an unknown parameter: from the caller's side, a report
			// whose spec cannot be read is a report that declares nothing lockable.
			throw new IllegalArgumentException("Could not read the parameters of report '" + reportId + "'");
		}

		Map<String, ReportParameter> byId = new LinkedHashMap<>();
		if (parameters != null)
			for (ReportParameter parameter : parameters)
				if (parameter != null && StringUtils.isNotBlank(parameter.id))
					byId.put(parameter.id, parameter);

		return byId;
	}

	/** One value, or every value of a multi-value lock — each checked the way a submission would be. */
	private Object checkedValue(ReportParameter parameter, Object value) {

		if (value instanceof Collection<?> values) {
			List<String> checked = new ArrayList<>();
			for (Object item : values)
				checked.add(checkedSingleValue(parameter, item));
			return checked;
		}

		return checkedSingleValue(parameter, value);
	}

	private String checkedSingleValue(ReportParameter parameter, Object value) {

		String asText = value == null ? "" : String.valueOf(value);

		// A parameter that declares no type says nothing about its values, so there is nothing to check.
		if (StringUtils.isBlank(parameter.type))
			return asText;

		// The type is checked whether or not the parameter constrains its values: locking a date
		// parameter to "31/01/2026" produces a link that fails when someone opens it, which is a worse
		// answer than refusing to create it.
		Object typed = typed(parameter, asText);

		if (parameter.constraints == null || parameter.constraints.isEmpty())
			return asText;

		try {
			new ParameterValidator().validate(parameter, typed, new HashMap<>());
		} catch (ValidationException e) {
			throw new IllegalArgumentException(e.getMessage());
		}

		return asText;
	}

	/**
	 * {@link ParameterValidator} compares dates as dates and numbers as numbers, so a locked value
	 * arriving as text has to become the type the report declared before it can be checked at all.
	 */
	private Object typed(ReportParameter parameter, String value) {

		switch (StringUtils.lowerCase(parameter.type)) {

		case "integer":
			try {
				return Long.valueOf(value.trim());
			} catch (NumberFormatException e) {
				throw new IllegalArgumentException(
						"Parameter '" + parameter.id + "' expects a whole number, not '" + value + "'");
			}

		case "date":
			try {
				return java.sql.Date.valueOf(LocalDate.parse(value.trim()));
			} catch (Exception e) {
				throw new IllegalArgumentException(
						"Parameter '" + parameter.id + "' expects a date as yyyy-MM-dd, not '" + value + "'");
			}

		default:
			return value;
		}
	}
}
