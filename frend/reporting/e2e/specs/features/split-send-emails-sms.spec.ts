import * as path from 'path';
const slash = require('slash');

import { Page, test } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import * as PATHS from '../../utils/paths';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';

//DONE2
test.describe('', async () => {
  electronBeforeAfterAllTest(
    'should correctly send Payslips.pdf notifications by default SMS sender (My Report)',
    async ({ beforeAfterEach: firstPage }) => {
      const expectedOutputPdfFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '.pdf';
        },
      );

      const expectedOutputSmsFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '_sms_default.txt';
        },
      );

      await _splitSendVerifyEmailsAndSMSes(
        firstPage,
        Constants.SMS_DEFAULT,
        expectedOutputPdfFiles,
        expectedOutputSmsFiles,
        [],
      );
    },
  );

  electronBeforeAfterAllTest(
    'should correctly send Payslips.pdf notifications by Twilio SMS sender (My Report)',
    async ({ beforeAfterEach: firstPage }) => {
      const expectedOutputPdfFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '.pdf';
        },
      );
      const expectedOutputSmsFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '_sms_twilio.txt';
        },
      );

      await _splitSendVerifyEmailsAndSMSes(
        firstPage,
        Constants.SMS_TWILIO,
        expectedOutputPdfFiles,
        expectedOutputSmsFiles,
        [],
      );
    },
  );

  electronBeforeAfterAllTest(
    'should send Payslips.pdf notifications by Twilio SMS sender and should send the correct emails (My Report)',
    async ({ beforeAfterEach: firstPage }) => {
      const expectedOutputPdfFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '.pdf';
        },
      );
      const expectedOutputSmsFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '_sms_twilio.txt';
        },
      );
      const expectedOutputEmailFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '_email.txt';
        },
      );

      await _splitSendVerifyEmailsAndSMSes(
        firstPage,
        Constants.SMS_TWILIO,
        expectedOutputPdfFiles,
        expectedOutputSmsFiles,
        expectedOutputEmailFiles,
      );
    },
  );
});

const _splitSendVerifyEmailsAndSMSes = (
  firstPage: Page,
  mode: string,
  expectedOutputPdfFiles: string[],
  expectedOutputSmsFiles: string[],
  expectedOutputEmailFiles: string[],
): FluentTester => {
  const ft = new FluentTester(firstPage);

  ft.click('#topMenuConfiguration')
    .click('#topMenuConfigurationLoad_burst_' + PATHS.SETTINGS_CONFIG_FILE)
    // send checkbox settings
    .click('#btnEnableDisableDistribution')
    .click('#btnSendDocumentsSMS');

  if (expectedOutputEmailFiles.length > 0) ft.click('#btnSendDocumentsEmail');

  // SMS settings
  ft.click('#leftMenuSMSSettings');

  if (mode === Constants.SMS_TWILIO) {
    ft.click('#accountSid').typeText('00').click('#authToken').typeText('01');
  }
  // SMS Message settings
  ft.click('#tab-btn-smsMessageTab')
    .click('#fromTelephoneNumber')
    .typeText('00')
    .click('#toTelephoneNumber')
    .typeText('01')
    .click('#smsText')
    .typeText('We sent your October payslip to your email account.')
    .click('#topMenuBurst')
    .click('#leftMenuQualityAssurance')
    .click('#qaBurstFile')
    .setInputFiles(
      '#qaFileUploadInput',
      path.resolve(
        process.env.PORTABLE_EXECUTABLE_DIR + '/samples/burst/Payslips.pdf',
      ),
    )
    .click('#btnRunTest')
    .clickYesDoThis()
    //.waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
    .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
    .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
    .appStatusShouldBeGreatNoErrorsNoWarnings();

  if (expectedOutputPdfFiles.length > 0)
    ft.processingShouldHaveGeneratedOutputFiles(expectedOutputPdfFiles, 'pdf');

  if (expectedOutputSmsFiles.length > 0)
    ft.processingShouldHaveGeneratedOutputFiles(
      expectedOutputSmsFiles,
      '_sms_*.txt',
    );

  if (expectedOutputEmailFiles.length > 0)
    ft.processingShouldHaveGeneratedOutputFiles(
      expectedOutputEmailFiles,
      '_email.txt',
    );

  return ft;
};
