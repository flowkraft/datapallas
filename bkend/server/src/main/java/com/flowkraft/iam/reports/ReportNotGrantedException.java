package com.flowkraft.iam.reports;

import org.apache.commons.lang3.StringUtils;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Layer 2 refused: a report none of this person's groups grants.
 *
 * <p>Worded so the difference from layer 1 is visible to whoever reads the message. A layer-1
 * refusal names a database connection and is about what the report would reach;
 * this one names no connection, because the report may well be one the person could otherwise run —
 * an administrator has simply not given it to any of their groups.
 *
 * <p>A {@link ResponseStatusException} of the same family as {@code ReportNotRunnableException} and
 * {@code DashboardNotGrantedException}, so a 403 reads the same on the job door, the resume door and
 * the data doors.
 */
public class ReportNotGrantedException extends ResponseStatusException {

	private static final long serialVersionUID = 1L;

	public ReportNotGrantedException(String reportId) {
		super(HttpStatus.FORBIDDEN, message(reportId));
	}

	private static String message(String reportId) {

		String report = StringUtils.isBlank(reportId) ? "This report" : "The report '" + reportId + "'";

		return report + " is not one of the reports your groups give you access to."
				+ " Ask an administrator to add it to one of your groups.";
	}
}
