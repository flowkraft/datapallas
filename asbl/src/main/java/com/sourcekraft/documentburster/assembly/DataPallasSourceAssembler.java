package com.sourcekraft.documentburster.assembly;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.apache.commons.io.FileUtils;
import org.zeroturnaround.zip.ZipUtil;

public class DataPallasSourceAssembler extends AbstractAssembler {

	public DataPallasSourceAssembler() {
		super("target/package/db-src", "target/package/verified-db-src", "target/datapallas-src.zip");
	}

	@Override
	protected void compile() throws Exception {
		// No compilation needed for source package
	}

	@Override
	protected void preparePackage() throws Exception {
		// The source package is exactly the files of the commit — `git archive HEAD` — not "whatever sits in the
		// checkout". The name blocklist this replaces was wrong in both directions: on the VM it shipped 16,257
		// ignored files (WordPress plugins, themes, Eclipse files, a MySQL ca-key.pem) and it silently dropped 63
		// tracked ones (`*.dist`, `asbl/ci/jenkins/release-demos.sh`, `.git*`, `.skills/building-*`). git also
		// never follows a junction out of the tree, which is what killed the 2026-10-25 pack on the VM.
		File sourceDir = new File(Utils.getTopProjectFolderPath());
		File archive = File.createTempFile("datapallas-src-", ".zip");
		try {
			runGit(sourceDir, "archive", "--format=zip", "--prefix=" + topFolderName + "/", "HEAD", "-o",
					archive.getAbsolutePath());
			ZipUtil.unpack(archive, new File(packageDirPath));
		} finally {
			FileUtils.deleteQuietly(archive);
		}

		System.out.println(
				"------------------------------------- DONE:DataPallasSourceAssembler packed the commit's files ... -------------------------------------");
	}

	/** Runs git in {@code dir} and returns what it printed; fails loudly, with that output, when git does. */
	private static String runGit(File dir, String... args) throws Exception {
		List<String> command = new ArrayList<>(Arrays.asList("git", "-C", dir.getAbsolutePath()));
		command.addAll(Arrays.asList(args));
		Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
		boolean finished = process.waitFor(10, TimeUnit.MINUTES);
		String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
		if (!finished) {
			process.destroyForcibly();
			throw new IllegalStateException("git " + String.join(" ", args) + " did not finish in " + dir);
		}
		if (process.exitValue() != 0) {
			throw new IllegalStateException(
					"git " + String.join(" ", args) + " failed in " + dir + ": " + output);
		}
		return output;
	}

	@Override
	public void verify() throws Exception {
		ZipUtil.unpack(new File(targetPathZipFile), new File(verifyDirPath));

		// Verify key source directories/files exist
		String[] requiredPaths = { "/frend", "/bkend", "/pom.xml", "/README.md" };

		for (String path : requiredPaths) {
			String verifyFilePath = verifyDirPath + "/" + topFolderName + path;
			assertThat(new File(verifyFilePath).exists())
					.withFailMessage("Required path not found verifyFilePath: " + verifyFilePath).isTrue();
		}

		// And it must hold exactly the commit's files, nothing more: `git ls-files` is what git archive wrote.
		long trackedFiles = runGit(new File(Utils.getTopProjectFolderPath()), "ls-files").lines().count();
		long packagedFiles;
		try (Stream<Path> paths = Files.walk(new File(verifyDirPath + "/" + topFolderName).toPath())) {
			packagedFiles = paths.filter(path -> !Files.isDirectory(path)).count();
		}
		assertThat(packagedFiles)
				.withFailMessage("the source package holds " + packagedFiles + " files, the commit tracks " + trackedFiles)
				.isEqualTo(trackedFiles);
		System.out.println("------------------------------------- the source package holds exactly the commit's "
				+ trackedFiles + " files -------------------------------------");

		System.out.println(
				"------------------------------------- VERIFIED:DataPallasSourceAssembler source package ... -------------------------------------");
	}
}
