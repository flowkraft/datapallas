package com.flowkraft.iam.limits;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * A limited report author reached for a database connection that none of their groups allows.
 *
 * <p>A {@link ResponseStatusException} rather than a plain runtime exception, because the refusal
 * has to look the same at every choke point: ad-hoc SQL, schema, an inline script, a report's
 * datasource and a canvas export all answer 403 with the same sentence, whether the check fired in
 * a controller, in a service or half-way down the export pipeline, and without each of them having
 * to translate an exception of its own.
 */
public class ConnectionNotAllowedException extends ResponseStatusException {

	private static final long serialVersionUID = 1L;

	public ConnectionNotAllowedException(String connectionId) {
		super(HttpStatus.FORBIDDEN, "You are not allowed to use the database connection '" + connectionId + "'.");
	}
}
