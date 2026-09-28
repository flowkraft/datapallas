package com.flowkraft.embed;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Refuses a parameter that takes a name the server owns.
 *
 * <p>{@code dp_} is reserved for the built-in variables ({@link UserVariables}). A dashboard
 * parameter, a cube parameter or a lock with such a name would be silently overwritten on every
 * request — a control that does nothing, or a lock that locks nothing — so it is refused where it is
 * saved, with a message that says which name and why.
 *
 * <p>400, not 403: nobody is being denied anything, the name is simply not available.
 */
public class ReservedParameterNameException extends ResponseStatusException {

	private static final long serialVersionUID = 1L;

	public ReservedParameterNameException(String name) {
		super(HttpStatus.BAD_REQUEST, "'" + name + "' starts with the reserved prefix '" + UserVariables.PREFIX
				+ "': those names belong to the built-in variables the server sets on every request."
				+ " Choose another name.");
	}
}
