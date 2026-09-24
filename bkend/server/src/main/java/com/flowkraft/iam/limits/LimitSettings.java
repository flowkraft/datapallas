package com.flowkraft.iam.limits;

import java.util.Collections;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;

/**
 * The limits an admin sets on a group, as stored in {@code user_group.settings_json}.
 *
 * <pre>{ "connections": ["sales-pg", "hr-mysql"], "scripts": false }</pre>
 *
 * <p>The settings are few and fixed, so they live in one small class rather than in a DSL or in files:
 * a new kind of limit later is one more field here and one more control on the form, with no schema
 * change.
 *
 * <h2>What the fields mean</h2>
 * <ul>
 *   <li>{@code {}} — the group <b>sets no limits</b>. It is only for organising people (and for
 *       granting dashboards), and takes no part in the combining rule.</li>
 *   <li>{@code connections} — the database connection ids the group allows. Missing or {@code null}
 *       means all of them; an empty list means none.</li>
 *   <li>{@code scripts} — {@code false} means the group's report authors may not get server code run.
 *       Missing or {@code true} means they may.</li>
 * </ul>
 *
 * <h2>Why unknown keys are refused</h2>
 * A key nobody reads is a limit nobody enforces. If {@code maxRows} or a misspelt {@code connection}
 * saved quietly, the admin would see a limit on the screen that the server never applies — the worst
 * possible outcome for a security setting — so {@link #parse(String)} refuses it and the caller turns
 * that into a 400.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class LimitSettings {

	/**
	 * Private, and configured here rather than taken from Spring: Boot's mapper disables
	 * FAIL_ON_UNKNOWN_PROPERTIES, which is the one behaviour this class depends on.
	 */
	private static final ObjectMapper JSON = new ObjectMapper()
			.enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

	private List<String> connections;

	private Boolean scripts;

	public List<String> getConnections() {
		return connections;
	}

	public void setConnections(List<String> connections) {
		this.connections = connections;
	}

	public Boolean getScripts() {
		return scripts;
	}

	public void setScripts(Boolean scripts) {
		this.scripts = scripts;
	}

	/**
	 * @param json the stored {@code settings_json}; blank is read as {@code {}}
	 * @throws IllegalArgumentException on malformed JSON or a key this class does not know
	 */
	public static LimitSettings parse(String json) {
		if (json == null || json.isBlank())
			return new LimitSettings();
		try {
			return JSON.readValue(json, LimitSettings.class);
		} catch (UnrecognizedPropertyException unknownKey) {
			throw unknownKeyRefused(unknownKey);
		} catch (JsonProcessingException malformed) {
			throw new IllegalArgumentException("Limit settings are not valid JSON: " + malformed.getOriginalMessage());
		}
	}

	/**
	 * The same reading, for settings that arrive as part of a request body and have therefore already
	 * been parsed into a map. Going through the same class — rather than reading the map by hand — is
	 * what makes an unknown key a 400 at the endpoint instead of a field that saves and is never read.
	 *
	 * @throws IllegalArgumentException on a key this class does not know, or a value of the wrong type
	 */
	public static LimitSettings parseObject(Object raw) {
		if (raw == null)
			return new LimitSettings();
		if (raw instanceof LimitSettings settings)
			return settings;
		if (raw instanceof String json)
			return parse(json);
		try {
			return JSON.convertValue(raw, LimitSettings.class);
		} catch (IllegalArgumentException e) {
			if (e.getCause() instanceof UnrecognizedPropertyException unknownKey)
				throw unknownKeyRefused(unknownKey);
			throw new IllegalArgumentException("Limit settings are not valid: " + e.getMessage());
		}
	}

	private static IllegalArgumentException unknownKeyRefused(UnrecognizedPropertyException unknownKey) {
		return new IllegalArgumentException("Unknown limit setting '" + unknownKey.getPropertyName()
				+ "'. Known settings are 'connections' and 'scripts'.");
	}

	/** The stored form. A settings object with nothing set writes as {@code {}}. */
	public String toJson() {
		try {
			return JSON.writeValueAsString(this);
		} catch (JsonProcessingException e) {
			// Two nullable fields of String and Boolean; there is no input that can reach this.
			throw new IllegalStateException("Could not write limit settings", e);
		}
	}

	/** True for {@code {}}: a group that only organises people and never limits anybody. */
	public boolean setsNoLimits() {
		return connections == null && scripts == null;
	}

	public boolean allowsAllConnections() {
		return connections == null;
	}

	public boolean allowsConnection(String connectionId) {
		return allowsAllConnections() || connections.contains(connectionId);
	}

	public boolean allowsScripts() {
		return scripts == null || scripts;
	}

	/** Never null, so callers can iterate without a null check. */
	public List<String> connectionsOrEmpty() {
		return connections == null ? Collections.emptyList() : connections;
	}
}
