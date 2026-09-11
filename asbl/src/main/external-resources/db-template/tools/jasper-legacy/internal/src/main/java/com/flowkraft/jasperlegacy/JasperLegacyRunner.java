package com.flowkraft.jasperlegacy;

import java.io.File;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Command-line face of {@link JasperLegacyEngine}.
 *
 * Mirrors the option surface of DataPallas's own `datapallas.bat jasper`, so a
 * report moves between the JasperReports 7 engine and this one by changing the
 * command name and nothing else. Paths arriving here are already container
 * paths — jr.bat / jr.sh do the translation.
 *
 * Exit codes match the rest of the CLI: 0 success, 1 the job failed,
 * 2 the command line was invalid.
 */
public class JasperLegacyRunner {

	private static final String USAGE = String.join(System.lineSeparator(),
			"Usage: jr --report-dir=<dir> --jrxml=<file> --format=<fmt> --out=<file>",
			"          [--jdbc-url=<url>] [--jdbc-user=<user>] [--jdbc-pass=<password>]",
			"          [-p <key=value>]...",
			"",
			"  --report-dir   Folder holding the .jrxml and its resources",
			"  --jrxml        Main .jrxml template filename",
			"  --format       Output format: pdf, xlsx, csv, html",
			"  --out          Output file path",
			"  --jdbc-url     JDBC connection URL",
			"  --jdbc-user    JDBC username",
			"  --jdbc-pass    JDBC password",
			"  -p, --params   Report parameter as key=value (repeatable)");

	public static void main(String[] args) {
		try {
			System.exit(run(args));
		} catch (InvalidCommandLineException e) {
			System.err.println(e.getMessage());
			System.err.println();
			System.err.println(USAGE);
			System.exit(2);
		} catch (Exception e) {
			System.err.println("ERROR - " + e);
			e.printStackTrace(System.err);
			System.exit(1);
		}
	}

	private static int run(String[] args) throws Exception {
		Map<String, String> options = new LinkedHashMap<>();
		Map<String, String> reportParams = new LinkedHashMap<>();
		parse(args, options, reportParams);

		JasperLegacyEngine engine = new JasperLegacyEngine(m -> System.out.println("INFO - " + m));

		engine.render(
				new File(require(options, "report-dir")),
				require(options, "jrxml"),
				require(options, "format"),
				new File(require(options, "out")),
				options.get("jdbc-url"),
				options.get("jdbc-user"),
				options.getOrDefault("jdbc-pass", ""),
				reportParams);

		return 0;
	}

	private static void parse(String[] args, Map<String, String> options, Map<String, String> reportParams) {
		for (int i = 0; i < args.length; i++) {
			String arg = args[i];

			if ("-p".equals(arg) || "--params".equals(arg)) {
				if (i + 1 >= args.length) {
					throw new InvalidCommandLineException("Missing value after " + arg);
				}
				putKeyValue(reportParams, args[++i]);
			} else if (arg.startsWith("--params=")) {
				putKeyValue(reportParams, arg.substring("--params=".length()));
			} else if (arg.startsWith("--")) {
				String name;
				String value;
				int eq = arg.indexOf('=');
				if (eq > 0) {
					name = arg.substring(2, eq);
					value = arg.substring(eq + 1);
				} else {
					name = arg.substring(2);
					if (i + 1 >= args.length) {
						throw new InvalidCommandLineException("Missing value after --" + name);
					}
					value = args[++i];
				}
				options.put(name, value);
			} else {
				throw new InvalidCommandLineException("Unexpected argument: " + arg);
			}
		}
	}

	private static void putKeyValue(Map<String, String> target, String raw) {
		int eq = raw.indexOf('=');
		if (eq <= 0) {
			// The same message the main CLI gives, because the same thing causes it:
			// cmd.exe splits an unquoted key=value into two arguments.
			throw new InvalidCommandLineException(
					"Value for option '--params' should be in KEY=VALUE format but was " + raw);
		}
		target.put(raw.substring(0, eq), raw.substring(eq + 1));
	}

	private static String require(Map<String, String> options, String name) {
		String value = options.get(name);
		if (value == null || value.isEmpty()) {
			throw new InvalidCommandLineException("Missing required option: --" + name);
		}
		return value;
	}

	private static class InvalidCommandLineException extends RuntimeException {
		private static final long serialVersionUID = 1L;

		InvalidCommandLineException(String message) {
			super(message);
		}
	}
}
