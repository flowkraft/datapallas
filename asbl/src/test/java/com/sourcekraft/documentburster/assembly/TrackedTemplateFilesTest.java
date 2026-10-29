package com.sourcekraft.documentburster.assembly;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.File;
import java.io.FileFilter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Collection;
import java.util.Set;
import java.util.TreeSet;

import org.apache.commons.io.FileUtils;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * The packers copy a template folder from git's tracked files, with their bytes as they are on disk,
 * and check the package against the same list. Untracked and ignored files - a test's
 * {@code .master-key}, a playground's plugins, build output - never reach a package.
 */
public class TrackedTemplateFilesTest {

	@Rule
	public TemporaryFolder temp = new TemporaryFolder();

	private File repo;
	private File template;

	@Before
	public void aCheckoutWithEveryKindOfFile() throws Exception {
		repo = temp.newFolder("checkout");
		template = new File(repo, "asbl/db-template");

		git("init", "-q");
		write(repo, ".gitignore", "ignored-plugins/\n.master-key\n");
		write(repo, "outside-the-template.txt", "tracked, but not in the template");
		write(template, "tracked.txt", "as committed");
		write(template, "modified.txt", "as committed");
		write(template, "deleted-from-disk.txt", "as committed");
		write(template, "lib/nested/deep.txt", "as committed");
		write(template, "drafts/tracked-but-filtered.txt", "as committed");
		git("add", "-A");
		git("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "template");

		FileUtils.writeByteArrayToFile(new File(template, "modified.txt"),
				"changed on disk\r\nsecond line".getBytes(StandardCharsets.UTF_8));
		FileUtils.forceDelete(new File(template, "deleted-from-disk.txt"));
		write(template, "untracked.txt", "left by a developer");
		write(template, "config/_internal/.master-key", "written by a test");
		write(template, "ignored-plugins/plugin.php", "left by a container");
	}

	@Test
	public void onlyTheTrackedFilesAreCopiedWithTheirBytesAsTheyAreOnDisk() throws Exception {
		File packageDir = temp.newFolder("package");

		int copied = Utils.copyTrackedTemplateFiles(template, packageDir, null);

		assertThat(relativeFilesUnder(packageDir)).containsExactly("drafts/tracked-but-filtered.txt",
				"lib/nested/deep.txt", "modified.txt", "tracked.txt");
		assertThat(copied).isEqualTo(4);
		assertThat(Files.readAllBytes(new File(packageDir, "modified.txt").toPath()))
				.isEqualTo("changed on disk\r\nsecond line".getBytes(StandardCharsets.UTF_8));
	}

	@Test
	public void todaysFilterStillDropsWhatItDroppedBeforeFolderByFolder() throws Exception {
		File packageDir = temp.newFolder("package");
		FileFilter noDrafts = file -> !(file.isDirectory() && file.getName().equals("drafts"));

		Utils.copyTrackedTemplateFiles(template, packageDir, noDrafts);

		assertThat(relativeFilesUnder(packageDir)).containsExactly("lib/nested/deep.txt", "modified.txt",
				"tracked.txt");
	}

	@Test
	public void thePackageCheckReadsTheSameListAndNamesAMissingTrackedFile() throws Exception {
		File packageDir = temp.newFolder("package");
		Utils.copyTrackedTemplateFiles(template, packageDir, null);

		// the untracked, ignored and deleted files are not asked for
		assertThat(Utils.dir1ContainsAllTrackedFiles(packageDir, template, null)).isTrue();

		FileUtils.forceDelete(new File(packageDir, "lib/nested/deep.txt"));
		assertThatThrownBy(() -> Utils.dir1ContainsAllTrackedFiles(packageDir, template, null))
				.hasMessageContaining("deep.txt");
	}

	@Test
	public void theFilesGitDoesNotTrackAreNamedIgnoredOnesIncluded() throws Exception {
		assertThat(new TreeSet<>(Utils.filesGitDoesNotTrack(template))).containsExactly(
				"config/_internal/.master-key", "ignored-plugins/plugin.php", "untracked.txt");
	}

	@Test
	public void aFolderOutsideAGitCheckoutStopsThePacking() throws Exception {
		File notACheckout = temp.newFolder("not-a-checkout");
		write(notACheckout, "file.txt", "on disk only");

		assertThatThrownBy(() -> Utils.copyTrackedTemplateFiles(notACheckout, temp.newFolder("package"), null))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("git checkout");
	}

	private void git(String... args) throws Exception {
		String[] command = new String[args.length + 1];
		command[0] = "git";
		System.arraycopy(args, 0, command, 1, args.length);
		Process git = new ProcessBuilder(command).directory(repo).inheritIO().start();
		assertThat(git.waitFor()).as(String.join(" ", command)).isZero();
	}

	private static void write(File dir, String relativePath, String content) throws Exception {
		FileUtils.writeStringToFile(new File(dir, relativePath), content, StandardCharsets.UTF_8);
	}

	private static Set<String> relativeFilesUnder(File dir) {
		Set<String> relativePaths = new TreeSet<>();
		Collection<File> files = FileUtils.listFiles(dir, null, true);
		for (File file : files)
			relativePaths.add(dir.toPath().relativize(file.toPath()).toString().replace('\\', '/'));
		return relativePaths;
	}
}
