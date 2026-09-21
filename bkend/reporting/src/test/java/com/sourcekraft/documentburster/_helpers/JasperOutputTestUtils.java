package com.sourcekraft.documentburster._helpers;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;

import com.sourcekraft.documentburster.engine.excel.ExcelUtils;

/**
 * Content assertions for the spreadsheets JasperReports produces.
 *
 * WHY THIS EXISTS. The Jasper tests used to assert only that at least one
 * .xlsx existed in the output folder. JasperReports writes a workbook whether
 * or not the query returned anything, so a report that silently fetched zero
 * rows - wrong connection, wrong dialect, wrong identifier case - produced an
 * empty workbook and the test still passed. Every one of those is exactly the
 * failure mode a database migration introduces, which makes the old assertion
 * worse than none: it looks like coverage.
 *
 * The assertions here fail on an empty workbook, on the wrong number of output
 * files, and on a workbook that has rows but not the values the report was
 * supposed to carry.
 */
public class JasperOutputTestUtils {

	private JasperOutputTestUtils() {
	}

	/** Every non-blank cell of every sheet, trimmed, in sheet/row/column order. */
	public static List<String> cellValues(File spreadsheet) throws Exception {
		List<String> values = new ArrayList<>();
		try (InputStream input = new FileInputStream(spreadsheet); Workbook workbook = WorkbookFactory.create(input)) {
			for (int s = 0; s < workbook.getNumberOfSheets(); s++) {
				Sheet sheet = workbook.getSheetAt(s);
				for (Row row : sheet) {
					for (Cell cell : row) {
						String value = ExcelUtils.getCellValueAsString(cell);
						if (value != null && !value.trim().isEmpty()) {
							values.add(value.trim());
						}
					}
				}
			}
		}
		return values;
	}

	/** Rows that carry at least one non-blank cell - i.e. rows a human would see. */
	public static int dataRowCount(File spreadsheet) throws Exception {
		int count = 0;
		try (InputStream input = new FileInputStream(spreadsheet); Workbook workbook = WorkbookFactory.create(input)) {
			for (int s = 0; s < workbook.getNumberOfSheets(); s++) {
				for (Row row : workbook.getSheetAt(s)) {
					for (Cell cell : row) {
						String value = ExcelUtils.getCellValueAsString(cell);
						if (value != null && !value.trim().isEmpty()) {
							count++;
							break;
						}
					}
				}
			}
		}
		return count;
	}

	/** Fails unless the workbook has at least one row with something in it. */
	public static void assertNotEmpty(File spreadsheet) throws Exception {
		assertTrue("Output file should exist: " + spreadsheet.getAbsolutePath(), spreadsheet.exists());
		assertTrue("Output file should not be a zero-byte stub: " + spreadsheet.getName(), spreadsheet.length() > 0);

		int rows = dataRowCount(spreadsheet);
		assertTrue("JasperReports wrote " + spreadsheet.getName() + " but it carries no data rows - the query "
				+ "very likely returned nothing. An empty workbook is still a valid file, which is why file "
				+ "existence alone proves nothing.", rows > 0);
	}

	/** Fails unless every one of {@code expected} appears somewhere in the workbook. */
	public static void assertContainsValues(File spreadsheet, Collection<String> expected) throws Exception {
		assertFalse("Refusing to assert against an empty expected set - that would pass vacuously and hide "
				+ "exactly the zero-row failure this helper exists to catch.", expected.isEmpty());

		assertNotEmpty(spreadsheet);

		Set<String> actual = new LinkedHashSet<>(cellValues(spreadsheet));
		Set<String> missing = new TreeSet<>();
		for (String value : expected) {
			if (!actual.contains(value)) {
				missing.add(value);
			}
		}

		assertTrue("Missing from " + spreadsheet.getName() + ": " + missing + "\nPresent: " + actual, missing.isEmpty());
	}

	/**
	 * The assertion the burst-per-token Jasper tests need: one output file per
	 * burst token, named after the token, each carrying real data.
	 */
	public static void assertOneFilePerToken(String outputFolder, String extension, Collection<String> expectedTokens)
			throws Exception {
		assertFalse("Expected tokens must not be empty - see assertContainsValues.", expectedTokens.isEmpty());

		File folder = new File(outputFolder);
		assertTrue("Output folder must exist: " + folder.getAbsolutePath(), folder.exists());

		File[] produced = folder.listFiles((dir, name) -> name.endsWith(extension));
		Set<String> producedNames = new TreeSet<>();
		if (produced != null) {
			for (File file : produced) {
				producedNames.add(file.getName());
			}
		}

		Set<String> wantedNames = new TreeSet<>();
		for (String token : expectedTokens) {
			wantedNames.add(token + extension);
		}

		assertEquals("Output files should be exactly one per burst token", wantedNames, producedNames);

		for (String token : expectedTokens) {
			assertNotEmpty(new File(folder, token + extension));
		}
	}

	/** Convenience for the single-output reports. */
	public static File singleOutputFile(String outputFolder, String extension) {
		File folder = new File(outputFolder);
		File[] produced = folder.listFiles((dir, name) -> name.endsWith(extension));
		assertTrue("Output folder must exist and contain files: " + folder.getAbsolutePath(),
				produced != null && produced.length > 0);
		assertEquals("Expected exactly one " + extension + " file, got " + Arrays.toString(produced), 1,
				produced.length);
		return produced[0];
	}
}
