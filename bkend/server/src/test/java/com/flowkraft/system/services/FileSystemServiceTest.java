package com.flowkraft.system.services;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.flowkraft.system.dtos.FindCriteriaDto;

/**
 * The reports, connections and cubes lists are built from {@link FileSystemService#unixCliFind}, so its
 * order is the order users (and the e2e tests) see. Windows hands directory entries back in name order;
 * the result must be the same on every OS, not whatever order the file system happens to keep.
 */
public class FileSystemServiceTest {

	@TempDir
	Path dir;

	@Test
	void findListsFilesInNameOrderIgnoringCase() throws Exception {
		for (String name : Arrays.asList("eml-e-2-e-combined-email-conn.xml", "rbt-sample-northwind-sqlite.xml",
				"eml-contact.xml", "Beta.xml", "alpha.xml"))
			Files.writeString(dir.resolve(name), "<connection/>");

		List<String> found = new FileSystemService().unixCliFind(dir.toString(),
				new FindCriteriaDto(Arrays.asList("*.xml"), true, false, false, true));

		assertThat(found.stream().map(p -> Paths.get(p).getFileName().toString()).collect(Collectors.toList()))
				.containsExactly("alpha.xml", "Beta.xml", "eml-contact.xml", "eml-e-2-e-combined-email-conn.xml",
						"rbt-sample-northwind-sqlite.xml");
	}

	@Test
	void aFolderComesBeforeASiblingThatExtendsItsName() {
		// NTFS order: reports/a, reports/a/settings.xml, reports/a-b — a plain string sort would put a-b first
		assertThat(FileSystemService.compareLikeNtfs("/config/reports/a/settings.xml",
				"/config/reports/a-b/settings.xml")).isNegative();
		assertThat(FileSystemService.compareLikeNtfs("/config/reports/A/x.xml", "/config/reports/a/x.xml")).isZero();
	}

	@Test
	void namesAreComparedTheWayNtfsDoesInUpperCase() {
		// NTFS compares upper case: "A" (0x41) sorts before "_" (0x5F). A lower-case comparison would reverse it.
		assertThat(FileSystemService.compareLikeNtfs("/_apps", "/apps")).isPositive();
		assertThat(FileSystemService.compareLikeNtfs("/config/reports/Zeta", "/config/reports/_shared")).isNegative();
	}
}
