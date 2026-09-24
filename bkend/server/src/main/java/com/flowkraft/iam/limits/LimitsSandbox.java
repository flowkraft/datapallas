package com.flowkraft.iam.limits;

import java.util.List;

import org.codehaus.groovy.control.CompilerConfiguration;
import org.codehaus.groovy.control.customizers.SecureASTCustomizer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import groovy.lang.GroovyShell;

/**
 * The DSL check for a report author whose groups say {@code scripts: false}.
 *
 * <h2>Why a sandbox and not a refusal</h2>
 * Every widget DSL — a chart, a pivot, a report's parameter spec, a cube — is Groovy that this
 * server compiles and runs to read the options out of it. Refusing all of it would leave a limited
 * author unable to build a chart, which is the work they are here to do. So the DSL is checked
 * instead: it may be a DSL, and it may not be a program. What that means is
 * {@link SecureASTCustomizer}'s to decide — no imports of any kind, and none of the receivers that
 * lead out of the process.
 *
 * <h2>Compiled, not run</h2>
 * {@link GroovyShell#parse} compiles the text and stops. The real parser then runs the very same
 * text as it always has, so nothing downstream changes shape: this is a gate in front of it, not a
 * replacement for it.
 *
 * <h2>A syntax error is not a refusal</h2>
 * When the sandboxed compile fails, the text is compiled once more without the sandbox. If that
 * fails too, the DSL was simply broken and this says nothing: the normal parser reports it, with
 * the message and the line number the editor knows how to show. Only code that compiles perfectly
 * well and is refused by the sandbox is refused here.
 *
 * <p>Unlimited users keep today's exact code path — {@link #check} returns before it compiles
 * anything.
 */
@Component
public class LimitsSandbox {

	/**
	 * java.lang is imported into every Groovy script whether the author asks or not, so the import
	 * rules below cannot see these. They are named one by one instead: the process, its classes, its
	 * threads, and the two doors — reflection and the file system — that reach everything else.
	 */
	/**
	 * The packages a DSL has no business reaching into: the file system, the network, the process,
	 * reflection and the script engines. A DSL describes a chart or a cube; everything it needs for
	 * that — numbers, strings, lists, maps, dates, closures — is in the packages left out of here.
	 */
	private static final List<String> FORBIDDEN_PACKAGES = List.of(
			"java.io",
			"java.nio",
			"java.nio.file",
			"java.nio.channels",
			"java.net",
			"java.lang.reflect",
			"java.lang.invoke",
			"java.lang.annotation",
			"java.security",
			"javax.script",
			"javax.naming",
			"groovy.util",
			"org.codehaus.groovy.runtime",
			"sun.misc");

		private static final List<String> FORBIDDEN_RECEIVERS = List.of(
			"java.lang.System",
			"java.lang.Runtime",
			"java.lang.Class",
			"java.lang.Thread",
			"java.lang.ProcessBuilder",
			"java.lang.ClassLoader",
			"java.io.File",
			"java.nio.file.Files",
			"java.nio.file.Paths",
			"groovy.lang.GroovyShell",
			"groovy.util.Eval");

	private final LimitsService limitsService;

	@Autowired
	public LimitsSandbox(LimitsService limitsService) {
		this.limitsService = limitsService;
	}

	/** Refuses a DSL that is more than a DSL, for a caller who may not run scripts. */
	public void check(String dslCode) {

		if (limitsService.allowsScripts())
			return;

		if (dslCode == null || dslCode.isBlank())
			return;

		try {
			compile(dslCode, sandboxed());
		} catch (Exception refusedBySandbox) {
			if (!compilesWithoutTheSandbox(dslCode))
				return;

			throw new ScriptsNotAllowedException(
					"use this in a DSL: " + firstLineOf(refusedBySandbox.getMessage()));
		}
	}

	private boolean compilesWithoutTheSandbox(String dslCode) {
		try {
			compile(dslCode, new CompilerConfiguration());
			return true;
		} catch (Exception brokenDsl) {
			return false;
		}
	}

	private void compile(String dslCode, CompilerConfiguration configuration) {
		// A shell of its own every time: nothing compiled here is kept, and nothing is run.
		new GroovyShell(getClass().getClassLoader(), configuration).parse(dslCode);
	}

	private CompilerConfiguration sandboxed() {

		SecureASTCustomizer secure = new SecureASTCustomizer();

		// Named packages rather than an allow-list of the few that are fine: Groovy puts
		// `java.lang.Object` and `groovy.lang.Closure` into every script it compiles, so an empty
		// allow-list refuses "chart { title 'x' }" as firmly as it refuses a program. With the
		// indirect check on, `new java.io.File(...)` counts as an import of java.io.File, so
		// writing the package out in full does not get around the list.
		secure.setDisallowedStarImports(FORBIDDEN_PACKAGES);
		secure.setDisallowedStaticStarImports(FORBIDDEN_PACKAGES);
		secure.setIndirectImportCheckEnabled(true);

		secure.setPackageAllowed(false);
		secure.setDisallowedReceivers(FORBIDDEN_RECEIVERS);

		CompilerConfiguration configuration = new CompilerConfiguration();
		configuration.addCompilationCustomizers(secure);
		return configuration;
	}

	private static String firstLineOf(String message) {

		if (message == null || message.isBlank())
			return "it is not allowed here";

		for (String line : message.split("\n"))
			if (line.contains("[Static type checking]") || line.contains("not allowed"))
				return line.trim();

		return message.split("\n")[0].trim();
	}
}
