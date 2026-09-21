import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Answers the question a JasperReports Server refugee actually has: will my
 * reports run, and what do I have to do first?
 *
 * Reads .jrxml files as text and reports everything a template reaches for
 * outside itself — Server repository paths, scriptlet classes, fonts, exotic
 * query languages, missing sub-reports — then says which of those are a rewrite,
 * which are a file copy, and which need real work.
 *
 * With --fix it performs the one repair that is purely mechanical: turning
 * Server's repo: paths into paths relative to the report folder.
 *
 * Deliberately dependency-free and runnable as a source file, so it works before
 * anything has been installed, built or started:
 *
 *   java JasperMigrationAnalyzer <folder> [--fix]
 */
public class JasperMigrationAnalyzer {

	// ---------------------------------------------------------------- patterns

	/** Classic JRXML declares the JasperReports namespace or the old DTD. */
	private static final Pattern CLASSIC_MARKER = Pattern.compile(
			"jasperreports\\.sourceforge\\.net|<!DOCTYPE\\s+jasperReport", Pattern.CASE_INSENSITIVE);
	/** JasperReports 7 writes every band child as <element kind="...">. */
	private static final Pattern JR7_MARKER = Pattern.compile("<element\\s+kind\\s*=", Pattern.CASE_INSENSITIVE);

	private static final Pattern REPO_REFERENCE = Pattern.compile("\"(repo:[^\"]*)\"");
	private static final Pattern SCRIPTLET_CLASS = Pattern.compile("scriptletClass\\s*=\\s*\"([^\"]+)\"");
	private static final Pattern TEMPLATE_REFERENCE = Pattern
			.compile("\"([^\"]+\\.(?:jasper|jrxml))\"", Pattern.CASE_INSENSITIVE);
	private static final Pattern FONT_NAME = Pattern.compile("fontName\\s*=\\s*\"([^\"]+)\"");
	private static final Pattern QUERY_LANGUAGE = Pattern.compile("<queryString[^>]*language\\s*=\\s*\"([^\"]+)\"",
			Pattern.CASE_INSENSITIVE);
	private static final Pattern SUBREPORT_DIR_DECLARED = Pattern
			.compile("<parameter[^>]*name\\s*=\\s*\"SUBREPORT_DIR\"");
	private static final Pattern JASPER_REPORT_OPEN_TAG = Pattern.compile("(<jasperReport\\b[^>]*>)", Pattern.DOTALL);
	/**
	 * The report-level elements the JRXML schema places AFTER the parameters. A new
	 * parameter has to go in front of the first of them: anything earlier (style,
	 * subDataset, scriptlet, ...) must precede parameters, or JasperReports rejects the file.
	 */
	private static final Pattern AFTER_PARAMETERS = Pattern.compile(
			"<(parameter|queryString|field|sortField|variable|filterExpression|group|background|title|pageHeader"
					+ "|columnHeader|detail|columnFooter|pageFooter|lastPageFooter|summary|noData)\\b");
	/** Classes named in expressions or field/parameter declarations. */
	private static final Pattern CLASS_ATTRIBUTE = Pattern.compile("class\\s*=\\s*\"([A-Za-z_][\\w.$]*)\"");

	/** Fonts the renderer already has, so naming them costs nothing. */
	private static final Set<String> BUNDLED_FONTS = Set.of(
			"sansserif", "serif", "monospaced", "dialog", "dialoginput",
			"dejavu sans", "dejavu serif", "dejavu sans mono");

	/** Query languages that need no extra library. */
	private static final Set<String> BUILT_IN_QUERY_LANGUAGES = Set.of("sql", "csv", "xlsx", "xls", "json", "xpath",
			"empty", "");

	// ------------------------------------------------------------------- model

	private static final class Report {
		Path file;
		String content;
		String format = "unknown";
		final Set<String> repoFiles = new LinkedHashSet<>();
		final Set<String> repoNonFiles = new LinkedHashSet<>();
		final Set<String> scriptlets = new LinkedHashSet<>();
		final Set<String> customClasses = new LinkedHashSet<>();
		final Set<String> missingFonts = new LinkedHashSet<>();
		final Set<String> heavyQueryLanguages = new LinkedHashSet<>();
		final Set<String> subreportsAsJrxml = new LinkedHashSet<>();
		final Set<String> subreportsMissing = new LinkedHashSet<>();
		boolean subreportDirDeclared;
		boolean fixed;

		boolean isReady() {
			return repoFiles.isEmpty() && repoNonFiles.isEmpty() && scriptlets.isEmpty() && customClasses.isEmpty()
					&& missingFonts.isEmpty() && heavyQueryLanguages.isEmpty() && subreportsAsJrxml.isEmpty()
					&& subreportsMissing.isEmpty();
		}
	}

	// -------------------------------------------------------------------- main

	public static void main(String[] args) throws Exception {
		if (args.length < 1 || args[0].startsWith("-")) {
			System.out.println("Usage: " + command() + " <folder> [--fix]");
			System.out.println();
			System.out.println("  <folder>  a folder of .jrxml files, searched recursively");
			System.out.println("  --fix     rewrite Server repo: paths to paths relative to the report,");
			System.out.println("            keeping a .bak copy of every file it changes");
			System.exit(2);
		}

		Path root = Paths.get(args[0]).toAbsolutePath().normalize();
		boolean fix = args.length > 1 && "--fix".equalsIgnoreCase(args[1]);

		if (!Files.isDirectory(root)) {
			System.err.println("Not a folder: " + root);
			System.exit(2);
		}

		List<Path> files;
		try (Stream<Path> walk = Files.walk(root)) {
			files = walk.filter(Files::isRegularFile)
					.filter(p -> p.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".jrxml"))
					.sorted(Comparator.comparing(Path::toString))
					.collect(Collectors.toList());
		}

		if (files.isEmpty()) {
			System.out.println("No .jrxml files under " + root);
			System.exit(0);
		}

		List<Report> reports = new ArrayList<>();
		for (Path file : files) {
			reports.add(analyze(file, root));
		}

		if (fix) {
			for (Report report : reports) {
				applyRepoRewrite(report);
			}
			// Re-read so the printed report reflects what the files now say.
			for (Report report : reports) {
				if (report.fixed) {
					Report refreshed = analyze(report.file, root);
					refreshed.fixed = true;
					reports.set(reports.indexOf(report), refreshed);
				}
			}
		}

		print(root, reports, fix);
		System.exit(0);
	}

	// ---------------------------------------------------------------- analysis

	private static Report analyze(Path file, Path root) throws IOException {
		Report report = new Report();
		report.file = file;
		report.content = Files.readString(file, StandardCharsets.UTF_8);

		boolean classic = CLASSIC_MARKER.matcher(report.content).find();
		boolean jr7 = JR7_MARKER.matcher(report.content).find();
		report.format = classic ? "classic" : jr7 ? "jr7" : "unknown";

		report.subreportDirDeclared = SUBREPORT_DIR_DECLARED.matcher(report.content).find();

		Matcher repo = REPO_REFERENCE.matcher(report.content);
		while (repo.find()) {
			String reference = repo.group(1);
			// A repo: path with a file extension is a file we can move next to the
			// report. Anything else names a Server object — a data adapter, an input
			// control, a Domain — which has to be recreated, not copied.
			if (fileNameOf(reference).contains(".")) {
				report.repoFiles.add(reference);
			} else {
				report.repoNonFiles.add(reference);
			}
		}

		Matcher scriptlet = SCRIPTLET_CLASS.matcher(report.content);
		while (scriptlet.find()) {
			report.scriptlets.add(scriptlet.group(1));
		}

		Matcher clazz = CLASS_ATTRIBUTE.matcher(report.content);
		while (clazz.find()) {
			String name = clazz.group(1);
			if (isCustomClass(name)) {
				report.customClasses.add(name);
			}
		}

		Matcher font = FONT_NAME.matcher(report.content);
		while (font.find()) {
			String name = font.group(1);
			if (!BUNDLED_FONTS.contains(name.toLowerCase(Locale.ROOT))) {
				report.missingFonts.add(name);
			}
		}

		Matcher language = QUERY_LANGUAGE.matcher(report.content);
		while (language.find()) {
			String name = language.group(1).toLowerCase(Locale.ROOT);
			if (!BUILT_IN_QUERY_LANGUAGES.contains(name)) {
				report.heavyQueryLanguages.add(language.group(1));
			}
		}

		Matcher template = TEMPLATE_REFERENCE.matcher(report.content);
		while (template.find()) {
			String reference = template.group(1);
			String fileName = fileNameOf(reference);
			if (fileName.equalsIgnoreCase(file.getFileName().toString())) {
				continue; // a template naming itself is not a sub-report
			}
			if (fileName.toLowerCase(Locale.ROOT).endsWith(".jrxml")) {
				report.subreportsAsJrxml.add(fileName);
			}
			String compiled = stripExtension(fileName) + ".jasper";
			boolean present = Files.exists(file.getParent().resolve(compiled))
					|| Files.exists(file.getParent().resolve(fileName));
			if (!present) {
				report.subreportsMissing.add(compiled);
			}
		}

		return report;
	}

	private static boolean isCustomClass(String name) {
		if (!name.contains(".")) {
			return false; // a bare name is a primitive or an alias, not a class to supply
		}
		return !(name.startsWith("java.") || name.startsWith("javax.") || name.startsWith("jakarta.")
				|| name.startsWith("net.sf.jasperreports.") || name.startsWith("org.jfree."));
	}

	// --------------------------------------------------------------------- fix

	/**
	 * Rewrites "repo:/images/logo.png" into $P{SUBREPORT_DIR} + "images/logo.png",
	 * and declares SUBREPORT_DIR when the template does not already, because
	 * referencing an undeclared parameter is a compile error, not a warning.
	 */
	private static void applyRepoRewrite(Report report) throws IOException {
		if (report.repoFiles.isEmpty()) {
			return;
		}

		String updated = report.content;
		for (String reference : report.repoFiles) {
			String relative = reference.substring("repo:".length());
			while (relative.startsWith("/")) {
				relative = relative.substring(1);
			}
			updated = updated.replace("\"" + reference + "\"",
					"$P{SUBREPORT_DIR} + \"" + relative + "\"");
		}

		if (!report.subreportDirDeclared) {
			updated = declareSubreportDir(updated);
		}

		Files.writeString(report.file.resolveSibling(report.file.getFileName() + ".bak"), report.content,
				StandardCharsets.UTF_8);
		Files.writeString(report.file, updated, StandardCharsets.UTF_8);
		report.fixed = true;
	}

	/**
	 * Adds the SUBREPORT_DIR parameter where the JRXML schema allows it: in front of the
	 * first report-level parameter, query, field, ... or band. Sub-datasets carry their own
	 * queries and fields and all come before the report's parameters, so the search starts
	 * after the last of them. Placing it straight after the root tag broke every report
	 * that declares a style ("Invalid content was found starting with element 'style'").
	 */
	static String declareSubreportDir(String jrxml) {
		Matcher openTag = JASPER_REPORT_OPEN_TAG.matcher(jrxml);
		if (!openTag.find()) {
			return jrxml;
		}
		int searchFrom = Math.max(openTag.end(), jrxml.lastIndexOf("</subDataset>"));
		Matcher next = AFTER_PARAMETERS.matcher(jrxml);
		int insertAt = next.find(searchFrom) ? next.start() : jrxml.lastIndexOf("</jasperReport>");
		if (insertAt < 0) {
			return jrxml;
		}
		// keep the file's own indentation when the element starts its line
		int lineStart = jrxml.lastIndexOf('\n', insertAt - 1) + 1;
		String indent = jrxml.substring(lineStart, insertAt);
		boolean ownLine = indent.isBlank();
		if (!ownLine) {
			indent = "\t";
		}
		String nl = System.lineSeparator();
		String declaration = indent + "<parameter name=\"SUBREPORT_DIR\" class=\"java.lang.String\" isForPrompting=\"false\">" + nl
				+ indent + "\t<defaultValueExpression><![CDATA[\"\"]]></defaultValueExpression>" + nl
				+ indent + "</parameter>" + nl;
		return ownLine
				? jrxml.substring(0, lineStart) + declaration + jrxml.substring(lineStart)
				: jrxml.substring(0, insertAt) + nl + declaration + indent + jrxml.substring(insertAt);
	}

	// ------------------------------------------------------------------ output

	private static void print(Path root, List<Report> reports, boolean fixed) {
		System.out.println();
		System.out.println("JasperReports migration analysis");
		System.out.println(root);
		System.out.println("=".repeat(78));

		long classic = reports.stream().filter(r -> "classic".equals(r.format)).count();
		long jr7 = reports.stream().filter(r -> "jr7".equals(r.format)).count();
		long unknown = reports.size() - classic - jr7;

		System.out.println();
		System.out.println("WHICH ENGINE");
		System.out.printf("  %-4d classic JRXML (1.x - 6.21)   -> config/reports-jasper-legacy/%n", classic);
		System.out.printf("  %-4d JasperReports 7              -> config/reports-jasper/%n", jr7);
		if (unknown > 0) {
			System.out.printf("  %-4d could not be identified%n", unknown);
		}

		List<Report> needWork = reports.stream().filter(r -> !r.isReady()).collect(Collectors.toList());

		System.out.println();
		System.out.println("READINESS");
		System.out.printf("  %-4d run as they are%n", reports.size() - needWork.size());
		System.out.printf("  %-4d need something first%n", needWork.size());

		if (!needWork.isEmpty()) {
			System.out.println();
			System.out.println("WHAT EACH REPORT NEEDS");
			for (Report report : needWork) {
				System.out.println();
				System.out.println("  " + root.relativize(report.file));
				line(report.repoFiles, "repo: file", "rewrite the path and copy the file next to the report"
						+ " (run again with --fix to do the rewrite)");
				line(report.repoNonFiles, "repo: object",
						"a Server data adapter, input control or Domain — recreate it as a DataPallas connection or report parameter");
				line(report.scriptlets, "scriptlet", "copy the jar holding this class into tools/jasper-legacy/lib/");
				line(report.customClasses, "custom class",
						"copy the jar holding this class into tools/jasper-legacy/lib/");
				line(report.missingFonts, "font",
						"copy the font-extension jar into tools/jasper-legacy/lib/, or change the report to a bundled font");
				line(report.heavyQueryLanguages, "query language",
						"needs its own library (Hibernate, Mondrian) plus your mapping or schema — the hard case");
				line(report.subreportsAsJrxml, "sub-report as .jrxml",
						"JasperReports loads sub-reports compiled — point this at the .jasper");
				line(report.subreportsMissing, "sub-report missing",
						"not in the report folder — copy it in, compiled");
			}
		}

		System.out.println();
		System.out.println("SUMMARY");
		int repoFileCount = reports.stream().mapToInt(r -> r.repoFiles.size()).sum();
		int jarCount = (int) reports.stream()
				.flatMap(r -> Stream.concat(r.scriptlets.stream(), r.customClasses.stream())).distinct().count();
		int hardCount = (int) reports.stream().filter(r -> !r.repoNonFiles.isEmpty() || !r.heavyQueryLanguages.isEmpty())
				.count();

		if (fixed) {
			long fixedCount = reports.stream().filter(r -> r.fixed).count();
			System.out.printf("  %d report(s) rewritten, .bak kept beside each one.%n", fixedCount);
			System.out.println("  Copy the referenced files into each report's folder, keeping their subfolders.");
		} else if (repoFileCount > 0) {
			System.out.printf("  %d repo: file reference(s) — these can be rewritten for you.%n", repoFileCount);
		}
		if (jarCount > 0) {
			System.out.printf("  %d class(es) to supply: copy the jars you already have into tools/jasper-legacy/lib/.%n",
					jarCount);
		}
		if (hardCount > 0) {
			System.out.printf("  %d report(s) depend on JasperReports Server itself and need real work.%n", hardCount);
		}
		if (repoFileCount == 0 && jarCount == 0 && hardCount == 0 && !fixed) {
			System.out.println("  Nothing to do — drop these into the folder above and generate.");
		}

		// Nothing was written unless --fix was asked for, so end by offering it in a
		// form that can be pasted straight back into the terminal.
		if (!fixed && repoFileCount > 0) {
			System.out.println();
			System.out.println("DO IT AUTOMATICALLY?");
			System.out.println("  The repo: rewrites above are mechanical. To apply them — every changed");
			System.out.println("  file keeps a .bak copy beside it — run:");
			System.out.println();
			System.out.println("    " + command() + " \"" + root + "\" --fix");
			System.out.println();
			System.out.println("  Nothing else in this report is changed by --fix. The jars and the");
			System.out.println("  Server objects are yours to move.");
		}
		System.out.println();
	}

	private static void line(Set<String> values, String label, String advice) {
		if (values.isEmpty()) {
			return;
		}
		for (String value : values) {
			System.out.printf("    %-22s %s%n", label, value);
		}
		System.out.printf("    %-22s %s%n", "", "-> " + advice);
	}

	// ------------------------------------------------------------------ helpers

	/** How the user invoked this, so the suggested command matches their shell. */
	private static String command() {
		return System.getProperty("jr.command", "jr.bat analyze");
	}

	private static String fileNameOf(String reference) {
		String normalized = reference.replace('\\', '/');
		int slash = normalized.lastIndexOf('/');
		return slash >= 0 ? normalized.substring(slash + 1) : normalized;
	}

	private static String stripExtension(String fileName) {
		int dot = fileName.lastIndexOf('.');
		return dot > 0 ? fileName.substring(0, dot) : fileName;
	}
}
