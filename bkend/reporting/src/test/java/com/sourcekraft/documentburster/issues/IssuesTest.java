/*
 Issue 
 
 	https://github.com/sourcekraft/documentburster/issues/43
 
 Description
 
 	I had a customer of mine notice that a piece of data was missing from their burst messages. 
 	Said missing element is a manager�s name that I have mapped to a burst variable (e.g. Var41). 
 	I ran some tests and found that this missing data value didn�t reappear in the output Html messages 
 	until I moved down to Var9. 
 	This is an existing script that I have used in many prior versions and was working as recent as ver 8.3 
 	(I even retried ver 8.3 to make sure it wasn�t an issue with the source/feeder report�it isn�t). 
 	I will add that I did a side by side comparison between Configuration settings 
 	in the two versions and both are identical 
 	(including the �Number Of User Variables� setting in the Advanced tab). 
 	Would you please take a look into this? Let me know if you need any additional information.
 
 Investigation
 
 	Finally I might have understood better what is happening. 
 	It seems there is indeed a defect in the sense that the number of user variables is taken 
 	from the generic MyReports (settings.xml) and not from the specific 
 	02-watasklang2html.xml where you have 45. 
 	In My Report settings.xml you probably have the number of user variables configured as 10. 
 	Other important configuration (email configuration) is taken from 
 	02-watasklang2html.xml and this is the reason it was not easy to track this.
 	
 */

package com.sourcekraft.documentburster.issues;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.Arrays;
import java.util.List;

import javax.net.ssl.SSLHandshakeException;
import javax.ws.rs.client.Client;

import org.apache.commons.lang3.StringUtils;
import org.hazlewood.connor.bottema.emailaddress.EmailAddressValidator;
import org.junit.Test;

import com.sourcekraft.documentburster._helpers.PdfTestUtils;
import com.sourcekraft.documentburster._helpers.TestBursterFactory;
import com.sourcekraft.documentburster.engine.AbstractBurster;
import com.sourcekraft.documentburster.unit.further.other.UtilsTest;
import com.sourcekraft.documentburster.utils.LicenseUtils;

public class IssuesTest {

	@Test
	public final void issue43WithMakeSureNumberOfUserVariablesIsReadFromTheCustomConfigurationTemplate()
			throws Exception {

		final String PDF_NUMBER_OF_USER_VARIABLES_ISSUE43 = "src/test/resources/input/issues/number-of-user-variables-issue43.pdf";
		final String TOKEN_PAGE1 = "0B0AA2";

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY,

				"NumberOfUserVariablesIssue43-makeSureNumberOfUserVariablesIsReadFromTheCustomConfigurationTemplate");

		burster.burst(PDF_NUMBER_OF_USER_VARIABLES_ISSUE43, false, StringUtils.EMPTY, -1);

		// assert only 1 files have been generated
		String outputFolder = burster.getCtx().outputFolder + "/";
		assertEquals(1, new File(outputFolder).listFiles(UtilsTest.outputFilesFilter).length);

		// assert var41 has the expected value
		assertEquals("First Name 41", burster.getCtx().variables.getUserVariables(TOKEN_PAGE1).get("var41"));

		// assert that ${var41} is parsed correctly in
		// <burstfilename>${var3}-${var41}.${input_document_extension}</burstfilename>
		String path = burster.getCtx().outputFolder + "/WorkAuth Assignments - First Name-First Name 41.pdf";

		// assert the files have been generated
		File outputReport = new File(path);
		assertTrue(outputReport.exists());

	}

	@Test
	public void issue39WithEmailAddress() {

		String email = "tony@imi.solutions";
		assertThat(EmailAddressValidator.isValid(email)).isTrue();

	}

	@Test
	public final void issue61MakeSureTheSoftwareWorksFineEvenWhenServerReturnsSSLExceptionWhenCheckingTheLicense()
			throws Exception {

		class LicenseUtilsSSLExceptionMock extends LicenseUtils {

			@Override
			protected Object makeRequest(Client client, String url, String action, String jsonBody) throws Exception {

				throw new SSLHandshakeException(
						"PKIX path building failed: sun.security.provider.certpath.SunCertPathBuilderException: unable to find valid certification path to requested target\r\n"
								+ " ");

			}

		}

		LicenseUtils licenseUtilsSSLExceptionMock = new LicenseUtilsSSLExceptionMock();

		licenseUtilsSSLExceptionMock.setLicenseFilePath("src/test/resources/config/issues/license-issue61.xml");

		licenseUtilsSSLExceptionMock.checkLicense();

		// The server could not be reached, so nothing was confirmed and the licence
		// screen says so. What must NOT happen is the old behaviour, where an SSL
		// problem was reported back as a good licence.
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().isServerDown());
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().isInvalid());
		assertFalse(licenseUtilsSSLExceptionMock.getLicense().isValid());

		// ...and the customer, who WAS confirmed before the certificate broke, keeps
		// everything they paid for. Our outage is not their problem.
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().itWasPaid());

		assertTrue(licenseUtilsSSLExceptionMock.getLicense().getKey().equals("1234567890"));
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().getProduct().equals("DocumentBurster"));

		licenseUtilsSSLExceptionMock.getLicense().loadLicense();

		// The server could not be reached, so nothing was confirmed and the licence
		// screen says so. What must NOT happen is the old behaviour, where an SSL
		// problem was reported back as a good licence.
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().isServerDown());
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().isInvalid());
		assertFalse(licenseUtilsSSLExceptionMock.getLicense().isValid());

		// ...and the customer, who WAS confirmed before the certificate broke, keeps
		// everything they paid for. Our outage is not their problem.
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().itWasPaid());

		assertTrue(licenseUtilsSSLExceptionMock.getLicense().getKey().equals("1234567890"));
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().getProduct().equals("DocumentBurster"));

		final String PAYSLIPS_REPORT_PATH = "src/main/external-resources/template/samples/burst/Payslips.pdf";

		final List<String> tokens = Arrays.asList("alfreda.waldback@northridgehealth.org",
				"clyde.grew@northridgehealth.org", "kyle.butford@northridgehealth.org");

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY, "issue61Test-SSLException");
		burster.setLicenseUtils(licenseUtilsSSLExceptionMock);
		burster.burst(PAYSLIPS_REPORT_PATH, false, StringUtils.EMPTY, -1);

		PdfTestUtils.assertDefaultResults(burster, tokens);

		assertTrue(burster.getLicenseLimit() == Integer.MAX_VALUE);

		licenseUtilsSSLExceptionMock.getLicense().loadLicense();

		// The server could not be reached, so nothing was confirmed and the licence
		// screen says so. What must NOT happen is the old behaviour, where an SSL
		// problem was reported back as a good licence.
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().isServerDown());
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().isInvalid());
		assertFalse(licenseUtilsSSLExceptionMock.getLicense().isValid());

		// ...and the customer, who WAS confirmed before the certificate broke, keeps
		// everything they paid for. Our outage is not their problem.
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().itWasPaid());

		assertTrue(licenseUtilsSSLExceptionMock.getLicense().getKey().equals("1234567890"));
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().getProduct().equals("DocumentBurster"));

	}

}
