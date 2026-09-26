package com.sourcekraft.documentburster.common.db;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.util.LinkedHashMap;
import java.util.Map;

import org.codehaus.groovy.control.CompilerConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;
import groovy.sql.Sql;

/**
 * Runs a seed script against an open connection.
 *
 * <p>
 * One place holds the bindings a seed script may rely on, so that the Seed Data tab
 * ({@code connection run-seed}), the packager and the tests all hand a script the same
 * environment:
 * </p>
 * <ul>
 * <li>{@code dbSql} - a {@link groovy.sql.Sql} on the caller's connection;</li>
 * <li>{@code vendor} - the database vendor, as the connection settings name it;</li>
 * <li>{@code log} - a logger;</li>
 * <li>{@code params} - the caller's parameters, never null.</li>
 * </ul>
 *
 * <p>
 * A script that ships data files finds them through {@code params} or through the installation, as
 * the custom app seeds do - never through the folder it was read from. The Seed Data tab sends the
 * script as text and writes it to a temp file, so that folder says nothing about where a script
 * lives, and a script that relied on it worked everywhere except from the tab.
 * </p>
 */
public class SeedScriptRunner {

	private static final Logger log = LoggerFactory.getLogger(SeedScriptRunner.class);

	private SeedScriptRunner() {
	}

	/** Runs a script read from a file: the same as reading it and calling the text form. */
	public static void run(Connection connection, String vendor, Path scriptFile, Map<String, String> params)
			throws Exception {

		run(connection, vendor, Files.readString(scriptFile), params);
	}

	/** Runs a script the caller already holds as text, which is how the Seed Data tab sends one. */
	public static void run(Connection connection, String vendor, String scriptText, Map<String, String> params)
			throws Exception {

		Sql dbSql = new Sql(connection);

		Binding binding = new Binding();
		binding.setVariable("dbSql", dbSql);
		binding.setVariable("vendor", vendor);
		binding.setVariable("log", log);
		binding.setVariable("params", params != null ? params : new LinkedHashMap<String, String>());

		new GroovyShell(Thread.currentThread().getContextClassLoader(), binding, new CompilerConfiguration())
				.evaluate(scriptText);
	}
}
