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
 * <li>{@code params} - the caller's parameters, never null;</li>
 * <li>{@code scriptDir} - the folder the script was read from, for a script that ships data
 * files next to itself, and null when the caller has only the text.</li>
 * </ul>
 */
public class SeedScriptRunner {

	private static final Logger log = LoggerFactory.getLogger(SeedScriptRunner.class);

	private SeedScriptRunner() {
	}

	/** Runs a script read from a file; {@code scriptDir} is that file's folder. */
	public static void run(Connection connection, String vendor, Path scriptFile, Map<String, String> params)
			throws Exception {

		String scriptText = Files.readString(scriptFile);
		Path scriptDir = scriptFile.toAbsolutePath().getParent();

		run(connection, vendor, scriptText, scriptDir, params);
	}

	/** Runs a script the caller already holds as text; the script gets no {@code scriptDir}. */
	public static void run(Connection connection, String vendor, String scriptText, Map<String, String> params)
			throws Exception {

		run(connection, vendor, scriptText, null, params);
	}

	private static void run(Connection connection, String vendor, String scriptText, Path scriptDir,
			Map<String, String> params) throws Exception {

		Sql dbSql = new Sql(connection);

		Binding binding = new Binding();
		binding.setVariable("dbSql", dbSql);
		binding.setVariable("vendor", vendor);
		binding.setVariable("log", log);
		binding.setVariable("params", params != null ? params : new LinkedHashMap<String, String>());
		binding.setVariable("scriptDir", scriptDir != null ? scriptDir.toString() : null);

		new GroovyShell(Thread.currentThread().getContextClassLoader(), binding, new CompilerConfiguration())
				.evaluate(scriptText);
	}
}
