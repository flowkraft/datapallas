package com.flowkraft.iam.limits;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * A report author whose groups say {@code scripts: false} reached one of the ways a person gets
 * server code run: an inline script, a Groovy report hook, a Jasper template, a script-mode canvas
 * widget, or a DSL that is more than a DSL.
 *
 * <p>403, like {@link ConnectionNotAllowedException} and for the same reason: the refusal reads the
 * same wherever it fires, and the screen that triggered it needs no special case to show it.
 */
public class ScriptsNotAllowedException extends ResponseStatusException {

	private static final long serialVersionUID = 1L;

	public ScriptsNotAllowedException(String what) {
		super(HttpStatus.FORBIDDEN, "You are not allowed to " + what + ".");
	}
}
