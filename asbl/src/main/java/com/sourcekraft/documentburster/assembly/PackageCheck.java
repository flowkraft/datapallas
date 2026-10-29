package com.sourcekraft.documentburster.assembly;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * The package check: a pack holds the commit's template files and what the build makes, nothing else.
 * Every file must be tracked by git in one of the template folders (at the same path inside the
 * installation folder), or be on {@link #MADE_BY_THE_BUILD}; a few names are never allowed, tracked or not
 * ({@link #isNeverAllowed}). It ends every pack (each assembler's {@code verify()}), reads the image's file
 * list in {@code dp-ci.sh build}, and runs on a zip by hand, from the repo's top folder, with a JDK only:
 *
 * <pre>
 * java asbl/src/main/java/com/sourcekraft/documentburster/assembly/PackageCheck.java datapallas.zip [--commit &lt;sha&gt;] [--list]
 * java asbl/src/main/java/com/sourcekraft/documentburster/assembly/PackageCheck.java --image-file-list files.txt
 * </pre>
 *
 * A zip's first folder and an image's {@code /app/} and {@code /opt/datapallas/defaults/} are the
 * installation folder. {@code --commit} takes the tracked files of that commit (a kept release's zip);
 * without it, those of the checkout. Exit code 1 when a file does not belong.
 */
public final class PackageCheck {

	static final List<String> TEMPLATE_FOLDERS = Collections.unmodifiableList(Arrays.asList(
			"asbl/src/main/external-resources/db-template/", "asbl/src/main/external-resources/db-server-template/",
			"bkend/reporting/src/main/external-resources/template/"));

	/** Keys, credentials and runtime state an installation makes for itself. */
	static final Set<String> NEVER_ALLOWED_FILE_NAMES = Collections
			.unmodifiableSet(new HashSet<>(Arrays.asList(".master-key", "api-key.txt", ".embed-key", "iam.db")));

	/** Caches and dependencies a machine makes. */
	static final Set<String> NEVER_ALLOWED_FOLDER_NAMES = Collections
			.unmodifiableSet(new HashSet<>(Arrays.asList("__pycache__", ".next", "node_modules")));

	/** Where an image holds the installation folder: /app/, and the copy of config the entrypoint restores from. */
	static final List<String> IMAGE_ROOTS = Collections
			.unmodifiableList(Arrays.asList("/app/", "/opt/datapallas/defaults/"));

	/** What the build makes, by path inside the installation folder. */
	static final List<Pattern> MADE_BY_THE_BUILD = Collections.unmodifiableList(Arrays.asList(
			// the jars, the Server's web app, the web components
			Pattern.compile("lib/(burst|server)/[^/]+\\.jar"), Pattern.compile("lib/frend/.+"),
			Pattern.compile("tools/rb-webcomponents/.+"),
			// the image compiles the Jasper legacy analyzer (Dockerfile)
			Pattern.compile("tools/jasper-legacy/internal/analyze/classes/.+"),
			// DataZeus, downloaded at pack time; the sample databases and the sample configuration
			Pattern.compile("db/datazeus/.+"), Pattern.compile("db/sample-northwind-sqlite/northwind\\.db"),
			Pattern.compile("db/sample-northwind-duckdb/northwind\\.duckdb"), Pattern.compile("config/samples/.+"),
			Pattern.compile("config/_defaults/[^/]+\\.xml"),
			Pattern.compile("samples/reports/(cubes|dashboard-demos|northwind)/.+"),
			// files the assemblers copy from elsewhere in the repo or rename
			Pattern.compile("log4j2\\.xml"), Pattern.compile("scripts/batch/schedules\\.groovy\\.example"),
			Pattern.compile("_apps/flowkraft/_ai-hub/\\.skills/datapallas-cookbook/ai-prompts-reference\\.ts"),
			Pattern.compile("_apps/cms-webportal-playground/wp-plugins/datapallas-portal/resources/views/"
					+ "(page-my-documents\\.php|single-paystub\\.php|content-type-paystub\\.png)"),
			// the desktop launcher; the Docker zip's compose file and README
			Pattern.compile("DataPallas\\.exe"), Pattern.compile("docker-compose\\.yml"), Pattern.compile("README\\.md")));

	/** What a check found: the files that do not belong, in two lists. */
	public static final class Result {
		public final int files;
		public final List<String> neverAllowed = new ArrayList<>();
		public final List<String> neitherTrackedNorMadeByTheBuild = new ArrayList<>();

		Result(int files) {
			this.files = files;
		}

		public boolean passes() {
			return neverAllowed.isEmpty() && neitherTrackedNorMadeByTheBuild.isEmpty();
		}

		public String report(String source, boolean everyFile) {
			StringBuilder report = new StringBuilder();
			int extra = neverAllowed.size() + neitherTrackedNorMadeByTheBuild.size();
			report.append("PACKAGE CHECK ").append(source).append(": ").append(files).append(" files, ").append(extra)
					.append(" do not belong\n");
			if (!neverAllowed.isEmpty()) {
				report.append("  never allowed (").append(neverAllowed.size()).append("):\n");
				if (everyFile)
					for (String path : neverAllowed)
						report.append("    ").append(path).append('\n');
				else
					for (Map.Entry<String, Integer> folder : byNeverAllowedFolder(neverAllowed).entrySet())
						report.append(String.format("    %6d  %s%n", folder.getValue(), folder.getKey()));
			}
			if (!neitherTrackedNorMadeByTheBuild.isEmpty()) {
				report.append("  not in git and not made by the build (").append(neitherTrackedNorMadeByTheBuild.size())
						.append("):\n");
				if (everyFile)
					for (String path : neitherTrackedNorMadeByTheBuild)
						report.append("    ").append(path).append('\n');
				else
					for (Map.Entry<String, Integer> folder : byFolder(neitherTrackedNorMadeByTheBuild).entrySet())
						report.append(String.format("    %6d  %s%n", folder.getValue(), folder.getKey()));
			}
			report.append("PACKAGE_CHECK=").append(passes() ? "PASS" : "FAIL").append(" extra=").append(extra);
			return report.toString();
		}
	}

	private PackageCheck() {
	}

	/**
	 * Checks the paths of a package (relative to its installation folder, '/'-separated) against the
	 * template paths git tracks (relative to their template folder).
	 */
	public static Result check(Collection<String> packagePaths, Set<String> trackedTemplatePaths) {
		Map<String, String> sameAsShown = new TreeMap<>();
		for (String path : packagePaths)
			sameAsShown.put(path, path);
		return check(sameAsShown, trackedTemplatePaths);
	}

	/** As above, for files shown by another path than the one inside the installation folder (an image's). */
	static Result check(Map<String, String> installationPathByShownPath, Set<String> trackedTemplatePaths) {
		Result result = new Result(installationPathByShownPath.size());
		for (Map.Entry<String, String> file : new TreeMap<>(installationPathByShownPath).entrySet()) {
			String path = file.getValue();
			if (isNeverAllowed(path))
				result.neverAllowed.add(file.getKey());
			else if (!trackedTemplatePaths.contains(path) && !isMadeByTheBuild(path))
				result.neitherTrackedNorMadeByTheBuild.add(file.getKey());
		}
		return result;
	}

	static boolean isNeverAllowed(String path) {
		String[] segments = path.split("/");
		for (int i = 0; i < segments.length - 1; i++)
			if (NEVER_ALLOWED_FOLDER_NAMES.contains(segments[i]))
				return true;
		String fileName = segments[segments.length - 1];
		return NEVER_ALLOWED_FILE_NAMES.contains(fileName) || fileName.endsWith(".log");
	}

	static boolean isMadeByTheBuild(String path) {
		for (Pattern pattern : MADE_BY_THE_BUILD)
			if (pattern.matcher(path).matches())
				return true;
		return false;
	}

	/** The end of a pack: the installation folder against the checkout's tracked template files. */
	public static void assertNothingExtra(File installationFolder, File repoTop) throws Exception {
		Result result = check(filesUnder(installationFolder.toPath()), trackedTemplatePaths(repoTop, null));
		String report = result.report(installationFolder.getPath(), false);
		System.out.println(report);
		if (!result.passes())
			throw new IllegalStateException(report);
	}

	/** The template paths git tracks, relative to their template folder: of the checkout, or of a commit. */
	public static Set<String> trackedTemplatePaths(File repoTop, String commit) throws Exception {
		List<String> command = new ArrayList<>(commit == null ? Arrays.asList("git", "ls-files", "-z", "--")
				: Arrays.asList("git", "ls-tree", "-r", "-z", "--name-only", commit, "--"));
		command.addAll(TEMPLATE_FOLDERS);
		Process git = new ProcessBuilder(command).directory(repoTop).redirectError(ProcessBuilder.Redirect.INHERIT)
				.start();
		String listing = new String(readAll(git.getInputStream()), StandardCharsets.UTF_8);
		if (git.waitFor() != 0)
			throw new IllegalStateException(String.join(" ", command) + " failed in " + repoTop.getAbsolutePath());
		Set<String> tracked = new HashSet<>();
		for (String repoPath : listing.split("\0"))
			for (String folder : TEMPLATE_FOLDERS)
				if (repoPath.startsWith(folder))
					tracked.add(repoPath.substring(folder.length()));
		if (tracked.isEmpty())
			throw new IllegalStateException("git tracks no template files in " + repoTop.getAbsolutePath());
		return tracked;
	}

	static List<String> filesUnder(Path installationFolder) throws IOException {
		try (Stream<Path> paths = Files.walk(installationFolder)) {
			return paths.filter(Files::isRegularFile)
					.map(p -> installationFolder.relativize(p).toString().replace('\\', '/'))
					.collect(Collectors.toList());
		}
	}

	/** A zip's files without its first folder (the installation folder). */
	static List<String> filesInZip(File zip) throws IOException {
		List<String> paths = new ArrayList<>();
		try (ZipFile zipFile = new ZipFile(zip)) {
			for (Enumeration<? extends ZipEntry> entries = zipFile.entries(); entries.hasMoreElements();) {
				ZipEntry entry = entries.nextElement();
				String name = entry.getName().replace('\\', '/');
				if (!entry.isDirectory() && name.indexOf('/') > 0)
					paths.add(name.substring(name.indexOf('/') + 1));
			}
		}
		return paths;
	}

	/**
	 * An image's files (one absolute path a line), by the path each has inside the installation folder
	 * ({@link #IMAGE_ROOTS}).
	 */
	static Map<String, String> filesInImageList(List<String> lines) {
		Map<String, String> installationPathByImagePath = new TreeMap<>();
		for (String line : lines) {
			String imagePath = line.trim();
			for (String root : IMAGE_ROOTS)
				if (imagePath.startsWith(root))
					installationPathByImagePath.put(imagePath, imagePath.substring(root.length()));
		}
		return installationPathByImagePath;
	}

	/** Grouped by the first four folders inside the installation folder (an image path keeps its root). */
	static Map<String, Integer> byFolder(List<String> paths) {
		Map<String, Integer> counts = new TreeMap<>();
		for (String shownPath : paths) {
			String root = "";
			for (String imageRoot : IMAGE_ROOTS)
				if (shownPath.startsWith(imageRoot))
					root = imageRoot;
			String[] segments = shownPath.substring(root.length()).split("/");
			String folder = segments.length <= 4 ? shownPath
					: root + String.join("/", Arrays.copyOf(segments, 4)) + "/";
			counts.merge(folder, 1, Integer::sum);
		}
		return counts;
	}

	/** Grouped up to the never-allowed folder ({@code .next/}, {@code __pycache__/} ...); a file alone by its path. */
	static Map<String, Integer> byNeverAllowedFolder(List<String> paths) {
		Map<String, Integer> counts = new TreeMap<>();
		for (String path : paths) {
			String[] segments = path.split("/");
			String group = path;
			for (int i = 0; i < segments.length - 1; i++)
				if (NEVER_ALLOWED_FOLDER_NAMES.contains(segments[i])) {
					group = String.join("/", Arrays.copyOf(segments, i + 1)) + "/";
					break;
				}
			counts.merge(group, 1, Integer::sum);
		}
		return counts;
	}

	private static byte[] readAll(InputStream in) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		byte[] buffer = new byte[8192];
		for (int n; (n = in.read(buffer)) > 0;)
			out.write(buffer, 0, n);
		return out.toByteArray();
	}

	public static void main(String[] args) throws Exception {
		String source = null, commit = null, imageFileList = null;
		boolean everyFile = false;
		for (int i = 0; i < args.length; i++) {
			if (args[i].equals("--commit"))
				commit = args[++i];
			else if (args[i].equals("--image-file-list"))
				imageFileList = args[++i];
			else if (args[i].equals("--list"))
				everyFile = true;
			else
				source = args[i];
		}
		Result result;
		if (imageFileList != null) {
			source = "image file list " + imageFileList;
			result = check(filesInImageList(Files.readAllLines(new File(imageFileList).toPath(), StandardCharsets.UTF_8)),
					trackedTemplatePaths(new File("."), commit));
		} else if (source != null && new File(source).isDirectory()) {
			result = check(filesUnder(new File(source).toPath()), trackedTemplatePaths(new File("."), commit));
		} else if (source != null && new File(source).isFile()) {
			result = check(filesInZip(new File(source)), trackedTemplatePaths(new File("."), commit));
		} else {
			System.err.println("usage: PackageCheck <zip | installation folder> [--commit <sha>] [--list]"
					+ "  |  PackageCheck --image-file-list <file> [--commit <sha>] [--list]   (run from the repo's top folder)");
			System.exit(2);
			return;
		}
		System.out.println(result.report(source, everyFile));
		System.exit(result.passes() ? 0 : 1);
	}
}
