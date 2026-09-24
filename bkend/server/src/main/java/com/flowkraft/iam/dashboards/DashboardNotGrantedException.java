package com.flowkraft.iam.dashboards;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * A dashboard viewer reached for a dashboard none of their groups grants.
 *
 * <p>A {@link ResponseStatusException}, like {@code ConnectionNotAllowedException}, so the refusal
 * reads the same whether it fired on the dashboard page, on the report config, on its data or on a
 * pivot of it — four requests that are one act of opening a dashboard.
 */
public class DashboardNotGrantedException extends ResponseStatusException {

	private static final long serialVersionUID = 1L;

	public DashboardNotGrantedException(String reportId) {
		super(HttpStatus.FORBIDDEN, "You are not allowed to open the dashboard '" + reportId + "'.");
	}
}
