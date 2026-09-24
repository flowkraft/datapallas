package com.flowkraft.iam.limits;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * A limited report author reached a file that would take their own limits off: the identity store
 * and the installation key under {@code config/_internal/}, a stored connection, or the file that
 * says which connection a report reads from.
 *
 * <p>The path is named in the message because these refusals are read by whoever is configuring
 * the installation, not by an attacker: knowing that {@code config/_internal/} is off limits is
 * how the screen explains itself.
 */
public class FileAccessNotAllowedException extends ResponseStatusException {

	private static final long serialVersionUID = 1L;

	public FileAccessNotAllowedException(String path) {
		super(HttpStatus.FORBIDDEN, "You are not allowed to use the path '" + path + "'.");
	}
}
