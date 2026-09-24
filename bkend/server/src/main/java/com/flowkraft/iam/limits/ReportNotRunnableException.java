package com.flowkraft.iam.limits;

import java.util.List;

import org.apache.commons.lang3.StringUtils;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * A limited caller asked to run — or to read the data of — a report whose datasource needs a
 * database connection none of their groups allows.
 *
 * <p>The sentence names the connection on purpose. A bare 403 here is the "it failed somewhere in
 * the middle" experience moved to the start of the job, which is not what was asked for: the person
 * has to be able to tell their administrator which connection they are missing, and the
 * administrator has to be able to act on it without reading a log.
 *
 * <p>A {@link ResponseStatusException} of the same family as {@link ConnectionNotAllowedException},
 * so the refusal reads the same whether it fired on the job door, on the resume door or on the data
 * door.
 */
public class ReportNotRunnableException extends ResponseStatusException {

	private static final long serialVersionUID = 1L;

	public ReportNotRunnableException(String reportId, String connectionId, List<String> allowed) {
		super(HttpStatus.FORBIDDEN, message(reportId, connectionId, allowed));
	}

	private static String message(String reportId, String connectionId, List<String> allowed) {

		String report = StringUtils.isBlank(reportId) ? "This report" : "The report '" + reportId + "'";

		String sentence = report + " cannot be run because it needs the database connection '" + connectionId
				+ "'.";

		if (allowed == null || allowed.isEmpty())
			return sentence + " You have access to no database connection.";

		return sentence + " You have access to " + String.join(", ", allowed) + ".";
	}

	/**
	 * The report could not be read, so what it would open is unknown. Refused rather than guessed:
	 * a report whose settings file is missing or unparseable is exactly the case where "assume it
	 * needs nothing" would let a limited caller through the one check meant to stop them.
	 */
	public static ReportNotRunnableException unreadable(String reportId) {
		return new ReportNotRunnableException(reportId);
	}

	private ReportNotRunnableException(String reportId) {
		super(HttpStatus.FORBIDDEN, (StringUtils.isBlank(reportId) ? "This report" : "The report '" + reportId + "'")
				+ " cannot be run: its configuration could not be read, so the database connections it needs"
				+ " are unknown.");
	}
}
