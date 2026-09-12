package com.flowkraft.reports;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Picking the main report out of a JasperReports folder.
 *
 * A folder can hold several .jrxml files — a report and the sub-reports it uses —
 * and only one of them is the report. Getting this wrong is not a cosmetic
 * problem: the wrong file becomes the report users see and run.
 *
 * Everything here is plain file logic, shared by both JasperReports engines. No
 * database, no Docker, no Spring context.
 */
public class ReportsServiceTest {

	@TempDir
	Path root;

	private final ReportsService reportsService = new ReportsService();

	private String mainReportIn(String folderName, String[][] files) throws Exception {
		Path folder = root.resolve(folderName);
		Files.createDirectories(folder);
		for (String[] file : files) {
			Files.writeString(folder.resolve(file[0]), file[1]);
		}
		File[] jrxmlFiles = folder.toFile().listFiles((dir, name) -> name.toLowerCase().endsWith(".jrxml"));
		return reportsService.selectMainJrxml(folder.toFile(), jrxmlFiles).getName();
	}

	@Test
	void aFolderHoldingOnlyOneTemplateNeedsNoInference() throws Exception {
		assertThat(mainReportIn("solo", new String[][] {
				{ "only.jrxml", "<jasperReport name=\"only\"/>" },
		})).isEqualTo("only.jrxml");
	}

	@Test
	void theSubReportIsNotTheReportEvenWhenItComesFirstAlphabetically() throws Exception {
		// The folder layout printed in the docs. "department_subreport" sorts
		// before "monthly_payslip", which is what made the naive pick wrong.
		assertThat(mainReportIn("monthly-payslip", new String[][] {
				{ "department_subreport.jrxml", "<jasperReport name=\"department_subreport\"/>" },
				{ "monthly_payslip.jrxml", "<jasperReport name=\"monthly_payslip\">"
						+ "<subreportExpression><![CDATA[$P{SUBREPORT_DIR} + \"department_subreport.jasper\"]]>"
						+ "</subreportExpression></jasperReport>" },
		})).isEqualTo("monthly_payslip.jrxml");
	}

	@Test
	void aSubReportIsRecognisedInTheJasperReports7SyntaxToo() throws Exception {
		// Both JRXML formats write the reference as a quoted string, which is why
		// one rule serves the classic and the JasperReports 7 engine alike.
		assertThat(mainReportIn("invoices", new String[][] {
				{ "a_lines.jrxml", "<jasperReport name=\"a_lines\"/>" },
				{ "invoices.jrxml", "<jasperReport name=\"invoices\"><element kind=\"subreport\">"
						+ "<expression><![CDATA[$P{SUBREPORT_DIR} + \"a_lines.jasper\"]]></expression>"
						+ "</element></jasperReport>" },
		})).isEqualTo("invoices.jrxml");
	}

	@Test
	void aSubReportIsRecognisedWhenTheParentStillPointsAtTheUncompiledJrxml() throws Exception {
		// A folder arriving from elsewhere often references sub-reports as .jrxml.
		// That will not RENDER — JasperReports loads sub-reports compiled — but the
		// main report still has to be identified correctly so the user can be told.
		assertThat(mainReportIn("headcount", new String[][] {
				{ "a_detail.jrxml", "<jasperReport name=\"a_detail\"/>" },
				{ "headcount.jrxml", "<jasperReport name=\"headcount\"><subreportExpression>"
						+ "<![CDATA[$P{SUBREPORT_DIR} + \"a_detail.jrxml\"]]></subreportExpression></jasperReport>" },
		})).isEqualTo("headcount.jrxml");
	}

	@Test
	void theJrxmlTwinOfACompiledSubReportIsNotTheReportEither() throws Exception {
		// Jaspersoft Studio leaves both files behind, so a folder usually holds
		// sub.jrxml AND sub.jasper while the parent references only the .jasper.
		// Matching on the base name is what keeps the twin from being mistaken
		// for the report.
		assertThat(mainReportIn("invoices", new String[][] {
				{ "a_lines.jrxml", "<jasperReport name=\"a_lines\"/>" },
				{ "invoices.jrxml", "<jasperReport name=\"invoices\"><subreportExpression>"
						+ "<![CDATA[$P{SUBREPORT_DIR} + \"a_lines.jasper\"]]></subreportExpression></jasperReport>" },
		})).isEqualTo("invoices.jrxml");
	}

	@Test
	void onlyTheTopOfASubReportChainIsTheReport() throws Exception {
		assertThat(mainReportIn("chain", new String[][] {
				{ "a_leaf.jrxml", "<jasperReport name=\"a_leaf\"/>" },
				{ "b_mid.jrxml", "<jasperReport name=\"b_mid\"><subreportExpression>"
						+ "<![CDATA[\"a_leaf.jasper\"]]></subreportExpression></jasperReport>" },
				{ "c_top.jrxml", "<jasperReport name=\"c_top\"><subreportExpression>"
						+ "<![CDATA[\"b_mid.jasper\"]]></subreportExpression></jasperReport>" },
		})).isEqualTo("c_top.jrxml");
	}

	@Test
	void namingAFileMainDecidesItWhateverElseIsInTheFolder() throws Exception {
		assertThat(mainReportIn("whatever", new String[][] {
				{ "aaa.jrxml", "<jasperReport name=\"aaa\"/>" },
				{ "main.jrxml", "<jasperReport name=\"main\"/>" },
		})).isEqualTo("main.jrxml");
	}

	@Test
	void aFileNamedAfterItsFolderWinsWhenNothingReferencesAnything() throws Exception {
		// "monthly-payslip" and "monthly_payslip" are the same name as far as this
		// is concerned — Jaspersoft Studio and humans disagree about separators.
		assertThat(mainReportIn("monthly-payslip", new String[][] {
				{ "aaa_helper.jrxml", "<jasperReport name=\"aaa_helper\"/>" },
				{ "monthly_payslip.jrxml", "<jasperReport name=\"payslip\"/>" },
		})).isEqualTo("monthly_payslip.jrxml");
	}

	@Test
	void theReportsOwnDeclaredNameIdentifiesItWhenTheFileNameDoesNot() throws Exception {
		assertThat(mainReportIn("sales-summary", new String[][] {
				{ "aa_other.jrxml", "<jasperReport name=\"aa_other\"/>" },
				{ "zz_report.jrxml", "<jasperReport name=\"sales_summary\"/>" },
		})).isEqualTo("zz_report.jrxml");
	}

	@Test
	void withNothingElseToGoOnTheLargestTemplateIsTheReport() throws Exception {
		// A report carries the page furniture; its fragments are smaller.
		assertThat(mainReportIn("unrelated", new String[][] {
				{ "aaa.jrxml", "<jasperReport name=\"aaa\"/>" },
				{ "zzz.jrxml", "<jasperReport name=\"zzz\">" + "x".repeat(500) + "</jasperReport>" },
		})).isEqualTo("zzz.jrxml");
	}
}
