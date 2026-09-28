package com.flowkraft.embed;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import reactor.core.publisher.Mono;

/**
 * The {@code ${dp_…}} variables of whoever is asking — their own, and nobody else's.
 *
 * <p>Everywhere a dashboard is <em>viewed</em>, these values are added on the server, after the
 * request has been read, so no viewer can name themselves somebody else ({@link UserVariables}).
 * The authoring screens are the one place that cannot work that way: the canvas builds a widget's
 * SQL in the browser and runs it through {@code /api/queries/run-sql}, which binds the parameters
 * the caller sends and nothing else. A cube with an {@code access_filter}, or a widget whose SQL
 * names {@code ${dp_user_email}}, would reach that endpoint with a placeholder nothing binds.
 *
 * <p>So the author's browser asks for its own values and sends them with the SQL it is running.
 * Nothing is weakened by that: the answer describes only the caller, and a report author may
 * already run any SQL at all through {@code run-sql} — which is exactly why this endpoint is
 * fenced by the same role. What it buys is that the SQL the author sees running is the SQL that
 * ships: the text keeps its placeholders, and the canvas shows the author their own rows, the way
 * a viewer will see theirs.
 */
@RestController
@RequestMapping(value = "/api/user-variables", produces = MediaType.APPLICATION_JSON_VALUE)
@PreAuthorize("hasRole('REPORT_AUTHOR')")
public class UserVariablesController {

	@Autowired
	private UserVariables userVariables;

	/** @return {@code {dp_user_id: …, dp_today: …, dp_attr_…: …}} for this caller. */
	@GetMapping(consumes = MediaType.ALL_VALUE)
	public Mono<Map<String, String>> mine(HttpServletRequest request) {
		return Mono.just(userVariables.of(request));
	}
}
