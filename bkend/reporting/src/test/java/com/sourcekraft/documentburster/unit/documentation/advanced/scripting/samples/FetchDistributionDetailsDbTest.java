package com.sourcekraft.documentburster.unit.documentation.advanced.scripting.samples;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.BeforeClass;
import org.junit.Test;

import com.sourcekraft.documentburster._helpers.DocumentTester;
import com.sourcekraft.documentburster._helpers.NorthwindTestUtils;
import com.sourcekraft.documentburster._helpers.TestBursterFactory;
import com.sourcekraft.documentburster.engine.AbstractBurster;
import com.sourcekraft.documentburster.unit.further.other.UtilsTest;

/**
 * Runs the SHIPPED sample script
 * scripts/burst/samples/fetch_distribution_details_from_database.groovy against
 * a real Northwind database.
 *
 * WHY THE SHIPPED FILE AND NOT A COPY. This sample is the one users are told to
 * paste into startExtractDocument.groovy. Testing a copy would let the two
 * drift, and the copy passing would say nothing about what ships. So the test
 * reads the shipped file and rewrites exactly ONE line in it - the JDBC URL,
 * which in the product points at the install folder's bundled database and
 * cannot resolve from a Maven module. Everything else (the read-only
 * Properties, the SQL, the derived e-mail address, the missing-row guard, the
 * three ctx user variables) runs verbatim.
 *
 * The substitution asserts it found the line it meant to replace, so
 * restructuring the sample makes this test fail loudly rather than quietly
 * testing nothing.
 *
 * ONE PAGE PER EMPLOYEE. The input has no burst tokens, so DocumentBurster
 * falls back to page numbers - which is precisely what makes it usable here,
 * because the sample looks its token up as an EmployeeID. The PDF is therefore
 * trimmed to as many pages as Northwind has employees; a fourth page would be a
 * token with no employee behind it, and the sample would (correctly) refuse it.
 */
public class FetchDistributionDetailsDbTest {

	private static final String LEGACY_NO_BURST_TOKENS_PATH = "src/test/resources/input/unit/pdf/legacy-no-burst-tokens.pdf";

	private static final String WORK_DIR = "./target/fetch-details-db";

	/** The shipped sample, rewritten only where it names the install folder. */
	private static final String SHIPPED_SAMPLE = "src/main/external-resources/template/scripts/burst/samples/fetch_distribution_details_from_database.groovy";

	private static final String SAMPLE_FILE_NAME = "fetch_distribution_details_from_database.groovy";

	private static String scriptsRoot;

	private static String trimmedInputPath;

	/** EmployeeID -> the address, first and last name the sample must produce. */
	private static List<Map<String, String>> employees;

	@BeforeClass
	public static void setUpBeforeClass() throws Exception {

		NorthwindTestUtils.setupTestDatabase();

		File workDir = new File(WORK_DIR);
		if (workDir.exists())
			FileUtils.deleteDirectory(workDir);
		FileUtils.forceMkdir(workDir);

		// The expectations come out of the database rather than being typed in
		// here, so they cannot drift away from what the generator produces. The
		// e-mail address is derived exactly as the sample derives it - see the
		// NOTE ON THE EMAIL ADDRESS in the sample for why Northwind's own Email
		// column cannot be used.
		employees = NorthwindTestUtils.queryRows(
				"SELECT \"EmployeeID\" AS employee_id, "
						+ "lower(\"FirstName\" || '.' || \"LastName\") || '@northwind.example' AS email_address, "
						+ "\"FirstName\" AS first_name, \"LastName\" AS last_name "
						+ "FROM \"Employees\" ORDER BY \"EmployeeID\"");

		assertFalse("Northwind must have employees for this sample to have anything to look up", employees.isEmpty());

		scriptsRoot = writeSampleWithTestDatabaseUrl();
		trimmedInputPath = trimInputToOnePagePerEmployee(employees.size());
	}

	@Test
	public void burst() throws Exception {

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY,
				"FetchDistributionDetailsDbTest-burst") {

			@Override
			protected void setUpScriptingRoots() {
				// The rewritten sample comes first, so it wins over the shipped
				// one of the same name further down the list.
				scripting.setRoots(new String[] { scriptsRoot, "src/test/groovy",
						"src/main/external-resources/template/scripts/burst",
						"src/main/external-resources/template/scripts/burst/internal",
						"src/main/external-resources/template/scripts/burst/samples" });
			}

			@Override
			protected void executeController() throws Exception {

				super.executeController();

				ctx.settings.setBurstFileName("${var0}_${var1}_${var2}.${input_document_extension}");
				ctx.scripts.startExtractDocument = SAMPLE_FILE_NAME;

			}
		};

		burster.burst(trimmedInputPath, false, StringUtils.EMPTY, -1);

		String outputFolder = burster.getCtx().outputFolder;

		assertEquals("One output file per employee", employees.size(),
				new File(outputFolder).listFiles(UtilsTest.outputFilesFilter).length);

		for (Map<String, String> employee : employees) {

			// The file name IS the assertion: it is built from var0/var1/var2,
			// so a name that matches proves the sample populated all three user
			// variables with this employee's own details. That is the whole
			// point of the sample - the risk it guards against is distributing
			// one person's document to another person's address.
			String path = outputFolder + "/" + employee.get("email_address") + "_" + employee.get("first_name") + "_"
					+ employee.get("last_name") + ".pdf";

			File outputReport = new File(path);
			assertTrue("Expected an output file named after employee " + employee.get("employee_id") + ": " + path,
					outputReport.exists());

			DocumentTester tester = new DocumentTester(path);
			tester.assertPageCountEquals(1);
			tester.close();
		}
	}

	/**
	 * Copies the shipped sample into a private scripts folder, pointing it at
	 * this module's test database instead of the product's install folder.
	 */
	private static String writeSampleWithTestDatabaseUrl() throws Exception {

		String sample = new String(Files.readAllBytes(Paths.get(SHIPPED_SAMPLE)), StandardCharsets.UTF_8);

		String shippedUrlLine = "def northwindUrl = 'jdbc:duckdb:./db/sample-northwind-duckdb/northwind.duckdb'";
		assertTrue(
				"The shipped sample no longer contains the connection line this test rewrites. "
						+ "Update the substitution below to match " + SHIPPED_SAMPLE,
				sample.contains(shippedUrlLine));

		sample = sample.replace(shippedUrlLine, "def northwindUrl = '" + NorthwindTestUtils.NORTHWIND_URL + "'");

		File scriptsDir = new File(WORK_DIR, "scripts");
		FileUtils.forceMkdir(scriptsDir);

		File script = new File(scriptsDir, SAMPLE_FILE_NAME);
		Files.write(script.toPath(), sample.getBytes(StandardCharsets.UTF_8));

		return scriptsDir.getPath();
	}

	/**
	 * Writes a copy of the input PDF carrying one page - therefore one burst
	 * token - per Northwind employee.
	 */
	private static String trimInputToOnePagePerEmployee(int pageCount) throws Exception {

		File trimmed = new File(WORK_DIR, "one-page-per-employee.pdf");

		try (PDDocument document = PDDocument.load(new File(LEGACY_NO_BURST_TOKENS_PATH))) {

			assertTrue(
					"The input PDF has fewer pages (" + document.getNumberOfPages() + ") than Northwind has employees ("
							+ pageCount + "), so it cannot produce a token for each",
					document.getNumberOfPages() >= pageCount);

			while (document.getNumberOfPages() > pageCount)
				document.removePage(document.getNumberOfPages() - 1);

			document.save(trimmed);
		}

		return trimmed.getPath();
	}
}
