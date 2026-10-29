package com.sourcekraft.documentburster.assembly;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.io.FileUtils;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * The package check's rule: every file of a pack is a tracked template file or something the build makes,
 * and keys, credentials, runtime state, caches and logs are never allowed, tracked or not.
 */
public class PackageCheckTest {

	@Rule
	public TemporaryFolder temp = new TemporaryFolder();

	private static final Set<String> TRACKED = new HashSet<>(
			Arrays.asList("config/burst/settings.xml", "_apps/flowkraft/_ai-hub/ui-startpage/package.json",
					// a key that was committed by mistake is still never allowed
					"config/_internal/.master-key"));

	@Test
	public void trackedFilesAndWhatTheBuildMakesPass() {
		PackageCheck.Result result = PackageCheck.check(Arrays.asList("config/burst/settings.xml",
				"_apps/flowkraft/_ai-hub/ui-startpage/package.json", "lib/burst/rb-reporting.jar",
				"lib/server/rb-server.jar", "lib/frend/main-ABC123.js", "tools/rb-webcomponents/rb-webcomponents.umd.js",
				"db/datazeus/courses/01/README.md", "db/sample-northwind-sqlite/northwind.db",
				"config/samples/g-dashboard/settings.xml", "config/_defaults/settings.xml",
				"samples/reports/dashboard-demos/sales.csv", "scripts/batch/schedules.groovy.example",
				"DataPallas.exe", "docker-compose.yml", "README.md"), TRACKED);

		assertThat(result.passes()).isTrue();
		assertThat(result.report("a pack", false)).endsWith("PACKAGE_CHECK=PASS extra=0");
	}

	@Test
	public void keysCredentialsRuntimeStateCachesAndLogsAreNeverAllowedTrackedOrNot() {
		PackageCheck.Result result = PackageCheck.check(Arrays.asList("config/_internal/.master-key",
				"config/_internal/api-key.txt", "config/_internal/.embed-key", "config/_internal/iam.db",
				"_apps/flowkraft/_ai-hub/custom-tools/__pycache__/db_query.cpython-311.pyc",
				"_apps/flowkraft/_ai-hub/ui-startpage/.next/build-manifest.json",
				"lib/frend/node_modules/left-pad/index.js", "logs/datapallas.log"), TRACKED);

		assertThat(result.neverAllowed).hasSize(8);
		assertThat(result.neitherTrackedNorMadeByTheBuild).isEmpty();
		assertThat(result.passes()).isFalse();
		assertThat(result.report("a pack", false)).contains("config/_internal/.master-key")
				.contains("_apps/flowkraft/_ai-hub/ui-startpage/.next/")
				.contains("_apps/flowkraft/_ai-hub/custom-tools/__pycache__/").endsWith("PACKAGE_CHECK=FAIL extra=8");
	}

	@Test
	public void aFileNeitherTrackedNorMadeByTheBuildIsNamedByItsFolder() {
		PackageCheck.Result result = PackageCheck.check(Arrays.asList(
				"_apps/cms-webportal-playground/wp-plugins/some-plugin/some-plugin.php",
				"_apps/cms-webportal-playground/wp-plugins/some-plugin/readme.txt",
				// the build's list names what it makes, nothing near it
				"lib/burst/notes.txt", "samples/reports/payslips/new.csv", "config/_defaults/notes/a.xml"),
				Collections.<String>emptySet());

		assertThat(result.neitherTrackedNorMadeByTheBuild).hasSize(5);
		assertThat(result.report("a pack", false))
				.contains("     2  _apps/cms-webportal-playground/wp-plugins/some-plugin/")
				.contains("not in git and not made by the build (5)").endsWith("PACKAGE_CHECK=FAIL extra=5");
	}

	@Test
	public void anImageIsCheckedInsideItsInstallationFolderAndShownByItsOwnPaths() {
		Map<String, String> imageFiles = PackageCheck.filesInImageList(Arrays.asList("/app/config/burst/settings.xml",
				"/app/config/_internal/.master-key", "/opt/datapallas/defaults/config/_internal/.master-key",
				"/app/_apps/flowkraft/grails-playground/.gradle/8.5/fileHashes.lock", "/usr/bin/java"));

		PackageCheck.Result result = PackageCheck.check(imageFiles, TRACKED);

		assertThat(result.files).isEqualTo(4);
		assertThat(result.neverAllowed).containsExactly("/app/config/_internal/.master-key",
				"/opt/datapallas/defaults/config/_internal/.master-key");
		assertThat(result.report("an image", false))
				.contains("     1  /app/_apps/flowkraft/grails-playground/.gradle/");
	}

	@Test
	public void aZipIsCheckedInsideItsFirstFolder() throws Exception {
		File zip = new File(temp.getRoot(), "datapallas.zip");
		try (ZipOutputStream out = new ZipOutputStream(new FileOutputStream(zip))) {
			for (String name : Arrays.asList("DataPallas/", "DataPallas/config/burst/settings.xml",
					"DataPallas/config/_internal/.master-key")) {
				out.putNextEntry(new ZipEntry(name));
				out.closeEntry();
			}
		}

		assertThat(PackageCheck.filesInZip(zip)).containsExactly("config/burst/settings.xml",
				"config/_internal/.master-key");
	}

	@Test
	public void theEndOfAPackComparesTheInstallationFolderWithTheCheckoutsTrackedTemplates() throws Exception {
		File repo = temp.newFolder("checkout");
		write(new File(repo, "asbl/src/main/external-resources/db-template/datapallas.sh"), "tracked");
		git(repo, "init", "-q");
		git(repo, "add", "-A");
		File installation = temp.newFolder("DataPallas");
		write(new File(installation, "datapallas.sh"), "tracked");
		write(new File(installation, "lib/burst/rb-reporting.jar"), "made by the build");

		PackageCheck.assertNothingExtra(installation, repo);

		write(new File(installation, "_apps/zz-proof.txt"), "left in the checkout");
		assertThatThrownBy(() -> PackageCheck.assertNothingExtra(installation, repo))
				.hasMessageContaining("_apps/zz-proof.txt").hasMessageContaining("PACKAGE_CHECK=FAIL extra=1");
	}

	private static void git(File repo, String... args) throws Exception {
		String[] command = new String[args.length + 1];
		command[0] = "git";
		System.arraycopy(args, 0, command, 1, args.length);
		Process git = new ProcessBuilder(command).directory(repo).inheritIO().start();
		assertThat(git.waitFor()).as(String.join(" ", command)).isZero();
	}

	private static void write(File file, String content) throws Exception {
		FileUtils.writeStringToFile(file, content, StandardCharsets.UTF_8);
	}
}
