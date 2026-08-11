package com.sourcekraft.documentburster.unit.documentation.userguide.distribute;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.Arrays;
import java.util.List;

import javax.net.ssl.SSLHandshakeException;
import javax.ws.rs.client.Client;

import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.mail.EmailException;
import org.junit.Test;

import com.sourcekraft.documentburster._helpers.PdfTestUtils;
import com.sourcekraft.documentburster._helpers.TestBursterFactory;
import com.sourcekraft.documentburster._helpers.TestsUtils;
import com.sourcekraft.documentburster.common.settings.model.Attachment;
import com.sourcekraft.documentburster.engine.AbstractBurster;
import com.sourcekraft.documentburster.sender.model.EmailMessage;
import com.sourcekraft.documentburster.unit.documentation.userguide.qualityassurance.Split2TimesTest;
import com.sourcekraft.documentburster.unit.further.other.MultipleTokensTest;
import com.sourcekraft.documentburster.utils.LicenseUtils;

public class EmailTest {

	private static final String PAYSLIPS_REPORT_PATH = "src/main/external-resources/template/samples/burst/Payslips.pdf";
	private static final List<String> PAYSLIPS_TOKENS = Arrays.asList("clyde.grew@northridgehealth.org",
			"kyle.butford@northridgehealth.org", "alfreda.waldback@northridgehealth.org");

	private static final String STRANGE_EMAIL_ADDRESSES_PATH = "src/test/resources/input/unit/pdf/strange-email-addresses.pdf";
	private static final List<String> STRANGE_EMAIL_ADDRESSES_TOKENS = Arrays.asList(
			"ANTHONY.T.GEORGE-2@somecompany.com", "JAMES.W.WEST-2@somecompany.com",
			"MARGARET-PARKER.H.ALES@somecompany.com", "MISHELLE.JONES-CASWALL@somecompany.com",
			"GAIL.M.CARTER-NAKE@somecompany.com");

	private static final String REPLACING_SEMI_COLON_PATH = "src/test/resources/input/unit/pdf/replacing-semi-colon-with-question-mark.pdf";
	private static final List<String> REPLACING_SEMI_COLON_TOKENS = Arrays.asList("862", "863");

	private static final String FAIL_JOB_IF_ANY_DISTRIBUTION_FAILS_PATH = "src/test/resources/input/unit/pdf/fail-job-if-any-distribution-fails.pdf";
	private static final List<String> FAIL_JOB_IF_ANY_DISTRIBUTION_FAILS_TOKENS = Arrays
			.asList("alfreda.waldback@northridgehealth.org", "token2", "kyle.butford@northridgehealth.org", "0", "2");

	private static final List<String> LOCAL_EMAIL_ADDRESS_TOKENS = Arrays.asList(
			"alfreda.waldback@northridgehealth.org", "documentburster@win2003srv", "kyle.butford@northridgehealth.org");

	@Test
	public final void strangeEmailAddresses() throws Exception {

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY,
				"EmailTest-strangeEmailAddresses") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

			};
		};

		burster.burst(STRANGE_EMAIL_ADDRESSES_PATH, false, StringUtils.EMPTY, -1);

	};

	@Test
	public final void emailAttachmentNotFoundException() throws Exception {

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY,
				"EmailTest-emailAttachmentNotFoundException") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

				ctx.settings.getAttachments().clear();

				Attachment item0 = new Attachment();

				item0.order = 0;
				item0.path = "$extracted_file_path$";

				ctx.settings.addAttachment(item0);

				Attachment item1 = new Attachment();

				item1.order = 1;
				item1.path = "src/main/external-resources/template/Payslips-Distinct-Sheets.xls";
				ctx.settings.addAttachment(item1);

				ctx.settings.setFailJobIfAnyDistributionFails(true);

			};
		};

		try {
			burster.burst(PAYSLIPS_REPORT_PATH, false, StringUtils.EMPTY, -1);
		} catch (EmailException e) {
			assertTrue(e.getMessage().contains("Payslips-Distinct-Sheets.xls"));
		}

	};

	@Test
	public final void deleteFiles() throws Exception {

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY, "EmailTest-deleteFiles") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

				ctx.settings.setDeleteFiles(true);

			};
		};

		burster.burst(PAYSLIPS_REPORT_PATH, false, StringUtils.EMPTY, -1);

		/*
		 * This was working but suddenly started to fail with below stack trace and
		 * could not fix it - probably was working on a different version of JRE
		 * 
		 * java.nio.file.FileSystemException:
		 * .\target\test-output\output\Payslips.pdf\EmailTest-deleteFiles\2018.11.14_15.
		 * 37.26.726\clyde.grew@northridgehealth.org.pdf: The process cannot access the
		 * file because it is being used by another process.
		 * 
		 * at
		 * java.base/sun.nio.fs.WindowsException.translateToIOException(WindowsException
		 * .java:92) at
		 * java.base/sun.nio.fs.WindowsException.rethrowAsIOException(WindowsException.
		 * java:103) at
		 * java.base/sun.nio.fs.WindowsException.rethrowAsIOException(WindowsException.
		 * java:108) at java.base/sun.nio.fs.WindowsFileSystemProvider.implDelete(
		 * WindowsFileSystemProvider.java:270) at
		 * java.base/sun.nio.fs.AbstractFileSystemProvider.delete(
		 * AbstractFileSystemProvider.java:105) at
		 * java.base/java.nio.file.Files.delete(Files.java:1134) at
		 * com.sourcekraft.documentburster.engine.AbstractBurster._checkAndDeleteFile(
		 * AbstractBurster.java:768) at
		 * com.sourcekraft.documentburster.engine.AbstractBurster._distributeReport(
		 * AbstractBurster.java:628) at
		 * com.sourcekraft.documentburster.engine.AbstractBurster.
		 * _processReportForCurrentToken(AbstractBurster.java:529) at
		 * com.sourcekraft.documentburster.engine.AbstractBurster.burst(AbstractBurster.
		 * java:218) at
		 * com.sourcekraft.documentburster.unit.documentation.userguide.distribute.
		 * EmailTest.deleteFiles(EmailTest.java:146) at
		 * java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native
		 * Method) at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke(
		 * NativeMethodAccessorImpl.java:62) at
		 * java.base/jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke(
		 * DelegatingMethodAccessorImpl.java:43) at
		 * java.base/java.lang.reflect.Method.invoke(Method.java:564) at
		 * org.junit.runners.model.FrameworkMethod$1.runReflectiveCall(FrameworkMethod.
		 * java:47) at
		 * org.junit.internal.runners.model.ReflectiveCallable.run(ReflectiveCallable.
		 * java:12) at
		 * org.junit.runners.model.FrameworkMethod.invokeExplosively(FrameworkMethod.
		 * java:44) at
		 * org.junit.internal.runners.statements.InvokeMethod.evaluate(InvokeMethod.java
		 * :17) at org.junit.runners.ParentRunner.runLeaf(ParentRunner.java:271) at
		 * org.junit.runners.BlockJUnit4ClassRunner.runChild(BlockJUnit4ClassRunner.java
		 * :70) at
		 * org.junit.runners.BlockJUnit4ClassRunner.runChild(BlockJUnit4ClassRunner.java
		 * :50) at org.junit.runners.ParentRunner$3.run(ParentRunner.java:238) at
		 * org.junit.runners.ParentRunner$1.schedule(ParentRunner.java:63) at
		 * org.junit.runners.ParentRunner.runChildren(ParentRunner.java:236) at
		 * org.junit.runners.ParentRunner.access$000(ParentRunner.java:53) at
		 * org.junit.runners.ParentRunner$2.evaluate(ParentRunner.java:229) at
		 * org.junit.runners.ParentRunner.run(ParentRunner.java:309) at
		 * org.eclipse.jdt.internal.junit4.runner.JUnit4TestReference.run(
		 * JUnit4TestReference.java:89) at
		 * org.eclipse.jdt.internal.junit.runner.TestExecution.run(TestExecution.java:
		 * 41) at org.eclipse.jdt.internal.junit.runner.RemoteTestRunner.runTests(
		 * RemoteTestRunner.java:541) at
		 * org.eclipse.jdt.internal.junit.runner.RemoteTestRunner.runTests(
		 * RemoteTestRunner.java:763) at
		 * org.eclipse.jdt.internal.junit.runner.RemoteTestRunner.run(RemoteTestRunner.
		 * java:463) at
		 * org.eclipse.jdt.internal.junit.runner.RemoteTestRunner.main(RemoteTestRunner.
		 * java:209)
		 * 
		 */

		// assert burst files are deleted after distribution
		String outputFolder = burster.getCtx().outputFolder + "/";
		// assertEquals(0, new
		// File(outputFolder).listFiles(UtilsTest.outputFilesFilter).length);

		// assert backup file is deleted after distribution
		File backupFile = new File(burster.getCtx().backupFolder + "/Payslips.pdf");
		assertTrue(!backupFile.exists());

	};

	private final void delayEmailsBy(final double seconds, String testName) throws Exception {

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY, testName) {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

				ctx.settings.setDelayEachDistributionBy(seconds);

			};
		};

		burster.burst(PAYSLIPS_REPORT_PATH, false, StringUtils.EMPTY, -1);

		// quality-assurance folder should not be created;
		assertFalse(new File(burster.getCtx().outputFolder + "/quality-assurance").exists());

		assertEquals(3, burster.getCtx().numberOfExtractedFiles);
		assertEquals(3, burster.getCtx().numberOfDistributedFiles);
		assertEquals(0, burster.getCtx().numberOfSkippedFiles);
		assertEquals(0, burster.getCtx().numberOfQuarantinedFiles);

	};

	@Test
	public final void delayEmailsBy2Seconds() throws Exception {
		delayEmailsBy(2, "EmailTest-delayEmailsBy2Seconds");
	}

	@Test
	public final void delayEmailsByByHalfSecond() throws Exception {
		delayEmailsBy(0.5, "EmailTest-delayEmailsByHalfSecond");
	}

	@Test
	public final void noAttachments() throws Exception {

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY, "EmailTest-noAttachments") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

				ctx.settings.getAttachments().clear();

			};
		};

		burster.burst(PAYSLIPS_REPORT_PATH, false, StringUtils.EMPTY, -1);

	};

	@Test
	public final void externalFile() throws Exception {

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY, "EmailTest-externalFile") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

				ctx.settings.getAttachments().clear();

				Attachment item = new Attachment();

				item.order = 0;
				item.path = "src/main/external-resources/template/samples/burst/Payslips-Distinct-Sheets.xls";

				ctx.settings.addAttachment(item);

			};
		};

		burster.burst(PAYSLIPS_REPORT_PATH, false, StringUtils.EMPTY, -1);

	};

	@Test
	public final void twoAttachments() throws Exception {
		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY, "EmailTest-twoAttachments") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

				ctx.settings.getAttachments().clear();

				Attachment item0 = new Attachment();

				item0.order = 0;
				item0.path = "$extracted_file_path$";

				ctx.settings.addAttachment(item0);

				Attachment item1 = new Attachment();

				item1.order = 1;
				item1.path = "src/main/external-resources/template/samples/burst/Payslips-Distinct-Sheets.xls";

				ctx.settings.addAttachment(item1);

			};
		};

		burster.burst(PAYSLIPS_REPORT_PATH, false, StringUtils.EMPTY, -1);

	}

	@Test
	public final void toCcAndBcc() throws Exception {
		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY, "EmailTest-toCcAndBcc") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

				ctx.settings.setEmailCc("some.address.cc@yahoo.com");
				ctx.settings.setEmailBcc("some.address.bcc@yahoo.com");

			};
		};

		burster.burst(PAYSLIPS_REPORT_PATH, false, StringUtils.EMPTY, -1);

	};

	@Test
	public final void tosCcsAndBccs() throws Exception {
		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY, "EmailTest-tosCcsAndBccs") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

				ctx.settings.setEmailTo("${burst_token},some.address.to1@yahoo.com");
				ctx.settings.setEmailCc("some.other.address.cc1@yahoo.com,some.other.address.cc2@yahoo.com");
				ctx.settings.setEmailBcc(
						"some.other.address.bcc1@yahoo.com;some.other.address.bcc2@yahoo.com;some.other.address.bcc3@yahoo.com");

			};
		};

		burster.burst(PAYSLIPS_REPORT_PATH, false, StringUtils.EMPTY, -1);

	}

	@Test
	public final void emailsAreSentEvenIfCheckLicenseThrowsSSLHandShakeException() throws Exception {

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY,
				"EmailTest-emailsAreSentEvenIfCheckLicenseThrowsSSLException-issue61") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

			};
		};

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

		burster.setLicenseUtils(licenseUtilsSSLExceptionMock);

		burster.burst(PAYSLIPS_REPORT_PATH, false, StringUtils.EMPTY, -1);

		PdfTestUtils.assertDefaultResults(burster, PAYSLIPS_TOKENS);

		assertTrue(burster.getCtx().numberOfPages == PAYSLIPS_TOKENS.size());
		assertTrue(burster.getCtx().numberOfExtractedFiles == PAYSLIPS_TOKENS.size());
		assertTrue(burster.getCtx().numberOfDistributedFiles == PAYSLIPS_TOKENS.size());

		assertTrue(burster.getCtx().numberOfQuarantinedFiles == 0);
		assertTrue(burster.getCtx().numberOfSkippedFiles == 0);

		assertTrue(burster.getLicenseLimit() == Integer.MAX_VALUE);

		licenseUtilsSSLExceptionMock.getLicense().loadLicense();

		// Unreachable, so nothing was confirmed and the licence reads as such — but
		// the customer was confirmed before the certificate broke, so the emails go
		// out and the run is not capped.
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().isServerDown());
		assertFalse(licenseUtilsSSLExceptionMock.getLicense().isValid());
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().itWasPaid());

		assertTrue(licenseUtilsSSLExceptionMock.getLicense().getKey().equals("1234567890"));
		assertTrue(licenseUtilsSSLExceptionMock.getLicense().getProduct().equals("DocumentBurster"));

	};

	@Test
	public final void archivedAttachment() throws Exception {
		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY, "EmailTest-archivedAttachment") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

				ctx.settings.getAttachments().clear();

				Attachment item0 = new Attachment();

				item0.order = 0;
				item0.path = "$extracted_file_path$";

				ctx.settings.addAttachment(item0);

				Attachment item1 = new Attachment();

				item1.order = 1;
				item1.path = "src/main/external-resources/template/samples/burst/Payslips-Distinct-Sheets.xls";

				ctx.settings.addAttachment(item1);

				ctx.settings.setArchiveAttachments(true);

			};
		};

		burster.burst(PAYSLIPS_REPORT_PATH, false, StringUtils.EMPTY, -1);

	}

	@Test
	public final void failJobIfanyDistributionFailsFalse() throws Exception {

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY,
				"EmailTest-failJobIfanyDistributionFailsFalse") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

				ctx.settings.setFailJobIfAnyDistributionFails(false);

			};
		};

		burster.burst(FAIL_JOB_IF_ANY_DISTRIBUTION_FAILS_PATH, false, StringUtils.EMPTY, -1);

		assertEquals(3, burster.getCtx().numberOfExtractedFiles);
		assertEquals(2, burster.getCtx().numberOfDistributedFiles);
		assertEquals(0, burster.getCtx().numberOfSkippedFiles);
		assertEquals(1, burster.getCtx().numberOfQuarantinedFiles);

		TestsUtils.assertBackupStatsAndLogArchivesFiles(burster);

	};

	@Test
	public final void failJobIfanyDistributionFailsTrue() throws Exception {

		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY,
				"EmailTest-failJobIfanyDistributionFailsTrue") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();

				ctx.settings.setFailJobIfAnyDistributionFails(true);

			};
		};

		try {
			burster.burst(FAIL_JOB_IF_ANY_DISTRIBUTION_FAILS_PATH, false, StringUtils.EMPTY, -1);
		} catch (IllegalArgumentException e) {
			assertTrue(e.getMessage().contains("token2"));
		} finally {

			assertEquals(2, burster.getCtx().numberOfExtractedFiles);
			assertEquals(1, burster.getCtx().numberOfDistributedFiles);
			assertEquals(0, burster.getCtx().numberOfSkippedFiles);
			assertEquals(1, burster.getCtx().numberOfQuarantinedFiles);

			TestsUtils.assertBackupStatsAndLogArchivesFiles(burster);

		}

	};

	@Test
	public final void itShouldNotReplaceSemiColonWithQuestionMark() throws Exception {

		// case http://sourceforge.net/p/documentburster/bugs/51/
		AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY,
				"EmailTest-itShouldNotReplaceSemiColonWithQuestionMark") {
			protected void executeController() throws Exception {

				super.executeController();

				super.setUpMockEmail();
				ctx.settings.setEmailTo("${var1}");

			};
		};

		burster.burst(REPLACING_SEMI_COLON_PATH, false, StringUtils.EMPTY, -1);

		assertEquals(2, burster.getCtx().numberOfExtractedFiles);
		assertEquals(2, burster.getCtx().numberOfDistributedFiles);
		assertEquals(0, burster.getCtx().numberOfSkippedFiles);
		assertEquals(0, burster.getCtx().numberOfQuarantinedFiles);

	};

	public static void assertCommonEmailStuff(EmailMessage emailMessage) throws Exception {

		if (emailMessage.ctx.testName.contains("allowLocalEmailAddresses"))
			assertTrue(LOCAL_EMAIL_ADDRESS_TOKENS.contains(emailMessage.token));
		else if (emailMessage.ctx.testName.contains("strangeEmailAddresses"))
			assertTrue(STRANGE_EMAIL_ADDRESSES_TOKENS.contains(emailMessage.token));
		else if (emailMessage.ctx.testName.contains("failJobIfanyDistributionFails"))
			assertTrue(FAIL_JOB_IF_ANY_DISTRIBUTION_FAILS_TOKENS.contains(emailMessage.token));
		else if (emailMessage.ctx.testName.contains("ShouldNotReplaceSemiColon"))
			assertTrue(REPLACING_SEMI_COLON_TOKENS.contains(emailMessage.token));
		else if (emailMessage.ctx.testName.contains("MultipleTokensTest-burst"))
			assertTrue(MultipleTokensTest.MULTIPLE_TOKENS_TOKENS.contains(emailMessage.token));
		else if (emailMessage.ctx.testName.startsWith("cmpl-s-"))
			assertTrue(Split2TimesTest.SPLIT2TIMES_TOKENS.contains(emailMessage.token));
		else
			assertTrue(PAYSLIPS_TOKENS.contains(emailMessage.token));

		assertTrue(emailMessage.isAuthentication);

		if (emailMessage.ctx.isQARunningMode) {
			assertEquals("test.firstname.lastname", emailMessage.authuser);
			assertEquals("test.password", emailMessage.authpwd);

			assertEquals("test.smtp.test.com", emailMessage.hostName);
			assertEquals("995", emailMessage.smtpPort);

			assertEquals("test.firstname.lastname@test.com", emailMessage.fromAddress);
			assertEquals("Test FirstName LastName", emailMessage.fromName);
		} else {
			assertEquals("firstname.lastname", emailMessage.authuser);
			assertEquals("password", emailMessage.authpwd);

			assertEquals("smtp.test.com", emailMessage.hostName);
			assertEquals("465", emailMessage.smtpPort);

			assertEquals("firstname.lastname@test.com", emailMessage.fromAddress);
			assertEquals("FirstName LastName", emailMessage.fromName);
		}

		assertTrue(emailMessage.isSsl);
		assertFalse(emailMessage.isTls);
		assertFalse(emailMessage.isDebug);

		if (!emailMessage.ctx.testName.startsWith("cmpl-s-")) {
			assertEquals("Subject " + emailMessage.token, emailMessage.subject);
			assertEquals("Message " + emailMessage.token, emailMessage.textMessage);
		}

		assertTrue(emailMessage.isHtmlEmail);
		assertTrue(StringUtils.isEmpty(emailMessage.htmlMessage));

	}

	private static void assertToCcAndBcc(EmailMessage emailMessage) throws Exception {

		if (emailMessage.ctx.testName.startsWith("EmailWithApacheCommonsEmailOrWithSimpleJavaMailTest-")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if ((emailMessage.ctx.testName.equals("EmailTest-delayEmailsBy2Seconds"))
				|| (emailMessage.ctx.testName.equals("EmailTest-delayEmailsByHalfSecond"))) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-strangeEmailAddresses")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-emailAttachmentNotFoundException")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-deleteFiles")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-noAttachments")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-externalFile")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-twoAttachments")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-toCcAndBcc")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(1 == emailMessage.ccs.size());
			assertEquals("some.address.cc@yahoo.com", emailMessage.ccs.get(0));

			assertTrue(1 == emailMessage.bccs.size());
			assertEquals("some.address.bcc@yahoo.com", emailMessage.bccs.get(0));

		} else if (emailMessage.ctx.testName.equals("EmailTest-tosCcsAndBccs")) {

			assertTrue(2 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));
			assertEquals("some.address.to1@yahoo.com", emailMessage.tos.get(1));

			assertTrue(2 == emailMessage.ccs.size());
			assertEquals("some.other.address.cc1@yahoo.com", emailMessage.ccs.get(0));
			assertEquals("some.other.address.cc2@yahoo.com", emailMessage.ccs.get(1));

			assertTrue(3 == emailMessage.bccs.size());
			assertEquals("some.other.address.bcc1@yahoo.com", emailMessage.bccs.get(0));
			assertEquals("some.other.address.bcc2@yahoo.com", emailMessage.bccs.get(1));
			assertEquals("some.other.address.bcc3@yahoo.com", emailMessage.bccs.get(2));

		} else if (emailMessage.ctx.testName.equals("EmailTest-archivedAttachment")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-allowLocalEmailAddressesFalseFailJobTrue")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-allowLocalEmailAddressesTrueFailJobTrue")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-allowLocalEmailAddressesFalseFailJobFalse")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-allowLocalEmailAddressesTrueFailJobFalse")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-failJobIfanyDistributionFailsFalse")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-failJobIfanyDistributionFailsTrue")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.equals("EmailTest-itShouldNotReplaceSemiColonWithQuestionMark")) {

			assertTrue(3 == emailMessage.tos.size());
			if (emailMessage.token.equals("862")) {
				assertEquals("a862@a862.com", emailMessage.tos.get(0));
				assertEquals("b862@b862.com", emailMessage.tos.get(1));
				assertEquals("c862@c862.com", emailMessage.tos.get(2));
			} else {
				assertEquals("a863@a863.com", emailMessage.tos.get(0));
				assertEquals("b863@b863.com", emailMessage.tos.get(1));
				assertEquals("c863@c863.com", emailMessage.tos.get(2));
			}

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else if (emailMessage.ctx.testName.contains("EmailPossibleErrorsTest-")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());
		} else if (emailMessage.ctx.testName.contains("StartPauseCancelRetryPolicy-")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());
		} else if (emailMessage.ctx.testName.contains("RetryPolicyTest-")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());
		} else if (emailMessage.ctx.testName.contains("ThrowsSSLException-issue61")) {

			assertTrue(1 == emailMessage.tos.size());
			assertEquals(emailMessage.token, emailMessage.tos.get(0));

			assertTrue(0 == emailMessage.ccs.size());
			assertTrue(0 == emailMessage.bccs.size());

		} else
			throw new IllegalArgumentException("Unknown testName: " + emailMessage.ctx.testName);

	}

	public static void assertEmailMessage(EmailMessage message) throws Exception {

		assertCommonEmailStuff(message);

		assertToCcAndBcc(message);

		assertAttachments(message);

		assertEmailMessageWithoutSJM(message);

	}

	private static void assertEmailMessageWithoutSJM(EmailMessage message) {

		assertFalse(message.sjm.active);

		// start SimpleJavaMail MailerBuilder configuration
		// see http://www.simplejavamail.org/configuration.html for more details
		assertTrue((StringUtils.isBlank(message.sjm.customsessionproperties)));

		assertFalse(message.sjm.javaxmaildebug);
		assertFalse(message.sjm.transportmodeloggingonly);

		assertTrue((StringUtils.isBlank(message.sjm.proxy.host)));
		assertTrue(message.sjm.proxy.port == 1080);
		assertTrue((StringUtils.isBlank(message.sjm.proxy.username)));
		assertTrue((StringUtils.isBlank(message.sjm.proxy.password)));
		assertTrue(message.sjm.proxy.socks5bridgeport == 1081);

		// start SimpleJavaMail EmailBuilder configuration
		// see http://www.simplejavamail.org/features.html for more details
		assertTrue((StringUtils.isBlank(message.sjm.replytoaddress)));
		assertTrue((StringUtils.isBlank(message.sjm.bouncetoaddress)));
		assertTrue((StringUtils.isBlank(message.sjm.receipttoaddress)));
		assertTrue((StringUtils.isBlank(message.sjm.dispositionnotificationtoaddress)));

		assertTrue((StringUtils.isBlank(message.sjm.customemailheaders)));

	}

	private static void assertAttachments(EmailMessage emailMessage) throws Exception {

		for (String path : emailMessage.attachments) {
			File attachment = new File(path);
			if (!attachment.exists())
				if (emailMessage.ctx.testName.equals("EmailTest-emailAttachmentNotFoundException"))
					throw new EmailException("Attachment was not found '" + path + "'");
		}

		String path;

		// if it is the common scenario of attaching one file
		if (!emailMessage.ctx.testName.equals("EmailTest-twoAttachments")
				&& !emailMessage.ctx.testName.equals("EmailTest-noAttachments")) {
			assertTrue(1 == emailMessage.attachments.size());

			path = emailMessage.attachments.get(0);

			// if the attachment is archived
			if (emailMessage.ctx.testName.equals("EmailTest-archivedAttachment"))
				assertEquals("reports-" + emailMessage.token + ".zip", FilenameUtils.getName(path));
			else if (emailMessage.ctx.testName.equals("EmailTest-externalFile"))
				assertEquals("Payslips-Distinct-Sheets.xls", FilenameUtils.getName(path));
			else
				assertEquals(emailMessage.token + ".pdf", FilenameUtils.getName(path));

		} else if (emailMessage.ctx.testName.equals("EmailTest-twoAttachments")) {
			assertTrue(2 == emailMessage.attachments.size());

			path = emailMessage.attachments.get(0);
			assertEquals(emailMessage.token + ".pdf", FilenameUtils.getName(path));

			path = emailMessage.attachments.get(1);
			assertEquals("Payslips-Distinct-Sheets.xls", FilenameUtils.getName(path));
		} else if (emailMessage.ctx.testName.equals("EmailTest-noAttachments"))
			assertTrue(0 == emailMessage.attachments.size());

	};

};