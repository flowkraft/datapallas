package com.sourcekraft.documentburster.assembly;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileFilter;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.io.IOCase;
import org.apache.commons.io.filefilter.DirectoryFileFilter;
import org.apache.commons.io.filefilter.NotFileFilter;
import org.apache.commons.io.filefilter.TrueFileFilter;
import org.apache.commons.io.filefilter.WildcardFileFilter;
import org.apache.maven.model.Model;
import org.apache.maven.model.io.xpp3.MavenXpp3Reader;
import org.zeroturnaround.exec.ProcessExecutor;
import org.zeroturnaround.exec.stream.LogOutputStream;

public class Utils {

	private static String PRODUCT_NAME = "DataPallas";

	/**
	 * Unzip {@code zipFile} into {@code destDir}, stripping the single top-level
	 * wrapper directory that GitHub "archive" zips add (e.g. {@code datazeus-main/}),
	 * so the repo contents land directly under {@code destDir}. Includes a zip-slip
	 * guard. Used at package time to bundle the self-contained DataZeus koans.
	 */
	public static void unzipFlatten(File zipFile, String destDir) throws IOException {
		File dest = new File(destDir);
		FileUtils.forceMkdir(dest);
		Path destPath = dest.toPath().toAbsolutePath().normalize();
		try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)))) {
			ZipEntry entry;
			while ((entry = zis.getNextEntry()) != null) {
				String name = entry.getName();
				int slash = name.indexOf('/');
				if (slash < 0) {
					// a top-level entry with no wrapper segment — skip bare dirs, keep files as-is
					if (entry.isDirectory())
						continue;
				} else {
					name = name.substring(slash + 1); // strip "datazeus-main/"
				}
				if (name.isEmpty())
					continue;
				File out = new File(dest, name);
				Path outPath = out.toPath().toAbsolutePath().normalize();
				if (!outPath.startsWith(destPath))
					throw new IOException("Refusing to extract outside target dir: " + entry.getName());
				if (entry.isDirectory()) {
					FileUtils.forceMkdir(out);
				} else {
					FileUtils.forceMkdir(out.getParentFile());
					try (OutputStream os = new BufferedOutputStream(new FileOutputStream(out))) {
						byte[] buf = new byte[8192];
						int n;
						while ((n = zis.read(buf)) > 0)
							os.write(buf, 0, n);
					}
				}
			}
		}
	}

	public static boolean dir1ContainsAllDir2Files(File dir1, File dir2) throws Exception {
		return dir1ContainsAllDir2Files(dir1, dir2, null);
	}

	public static boolean dir1ContainsAllDir2Files(File dir1, File dir2, FileFilter filter) throws Exception {
		Set<String> ignores = new HashSet<String>();
		ignores.add(Utils.getInstallationTopFolderName());
		ignores.add("dependencies");
		ignores.add("db-template");
		ignores.add("db-server-template");
		ignores.add("template");

		Set<String> dir1FileNames = new HashSet<String>();
		Collection<File> dir1Files = FileUtils.listFilesAndDirs(dir1, TrueFileFilter.TRUE, TrueFileFilter.TRUE);
		for (File dir1File : dir1Files) {
			dir1FileNames.add(FilenameUtils.getName(dir1File.getCanonicalPath()));
		}

		Set<String> dir2FileNames = new HashSet<String>();
		// Gather files from dir2, applying the filter if provided
		Collection<File> dir2Files;
		if (filter != null) {
			dir2Files = new ArrayList<>();
			collectFilesWithFilter(dir2, filter, dir2Files);
		} else {
			dir2Files = FileUtils.listFilesAndDirs(dir2, TrueFileFilter.TRUE, TrueFileFilter.TRUE);
		}

		for (File dir2File : dir2Files) {
			String fileName = FilenameUtils.getName(dir2File.getCanonicalPath());

			// Skip these files as they are renamed afterwards
			if (!fileName.startsWith("ant-launcher") && !fileName.startsWith("schedules.groovy")) {
				dir2FileNames.add(fileName);
			}
		}

		dir2FileNames.removeAll(dir1FileNames);
		dir2FileNames.removeAll(ignores);

		if (dir2FileNames.size() > 0)
			throw new Exception("Following files were found in '" + dir2.getAbsolutePath() + "' and were not found in '"
					+ dir1.getAbsolutePath() + "' : " + dir2FileNames.toString());

		return true;
	}

	// Helper method to recursively collect files applying the filter
	private static void collectFilesWithFilter(File directory, FileFilter filter, Collection<File> results) {
		File[] files = directory.listFiles();
		if (files != null) {
			for (File file : files) {
				// Only include files that match the filter
				if (filter.accept(file)) {
					results.add(file);

					// Recurse into directories
					if (file.isDirectory()) {
						collectFilesWithFilter(file, filter, results);
					}
				}
			}
		}
	}

	public static String getTopProjectFolderPath() throws Exception {

		String topProjectFolderPath = (new File("..")).getCanonicalPath();

		return topProjectFolderPath;

	}

	public static void runMaven(String pomXmlFolderPath, String mavenCommand) throws Exception {

		if (!mavenCommand.contains("-Djavac.compiler.path")) {
			String rootPath = "C:/Program Files";
			String pattern = ".*Eclipse Adoptium\\\\jdk-17.*-hotspot.*";

			try (Stream<Path> paths = Files.walk(Paths.get(rootPath))) {
				String compilerPath = paths.filter(Files::isDirectory).map(Path::toString)
						.filter(Pattern.compile(pattern).asPredicate()).findFirst()
						.orElseThrow(() -> new RuntimeException("Directory not found"));

				System.out.println("Compiler path: " + compilerPath); // Debug output

				mavenCommand += " -Djavac.compiler.path=\"" + compilerPath + "/bin/javac.exe\"";

				System.out.println("Maven command: " + mavenCommand); // Debug output
			}
		}

		int exitCode = new ProcessExecutor().directory(new File(pomXmlFolderPath)).command("cmd", "/c", mavenCommand)
				.redirectOutput(new LogOutputStream() {
					@Override
					protected void processLine(String line) {
						System.out.println(line);
					}
				}).execute().getExitValue();

		if (exitCode != 0) {
			throw new RuntimeException("Maven command failed (exit " + exitCode + "): " + mavenCommand);
		}

	}

	public static void removeVersionFromAntLauncherFileName(String folderPath) throws Exception {

		Collection<File> files = FileUtils.listFiles(new File(folderPath),
				new WildcardFileFilter("ant-launcher*.jar", IOCase.INSENSITIVE),
				new NotFileFilter(DirectoryFileFilter.DIRECTORY));

		if ((files == null) || (files.size() != 1))
			throw new Exception("ant-launcher*.jar WAS NOT FOUND IN " + folderPath + " directory");

		FileUtils.moveFile(files.iterator().next(), new File(folderPath + "/" + "ant-launcher.jar"));

	}

	public static String getInstallationTopFolderName() throws Exception {

		// return PRODUCT_NAME + "-" + Utils.getProductVersion();
		return PRODUCT_NAME;

	}

	public static String getProductVersion() throws Exception {

		return Utils.getMavenProperty("revision");

	}

	public static String getMavenProperty(String property) throws Exception {

		MavenXpp3Reader reader = new MavenXpp3Reader();
		Model model = reader.read(new FileReader("../pom.xml"));

		return model.getProperties().getProperty(property);

	}

}
