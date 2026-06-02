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
    'should correctly upload Payslips.pdf to ftp, sftp, fileshare, ftps and http (My Report)',
    async ({ beforeAfterEach: firstPage }) => {
      const expectedOutputPdfFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '.pdf';
        },
      );

      const expectedOutputUploadFiles: string[] = [];

      Constants.PAYSLIPS_PDF_BURST_TOKENS.forEach(function (token) {
        ['ftp', 'sftp', 'fileshare', 'ftps', 'http', 'cloud'].forEach(
          function (uploadType) {
            expectedOutputUploadFiles.push(
              token + '_' + uploadType + '_upload.txt',
            );
          },
        );
      });

      await _splitSendVerifyEmailsAndUploads(
        firstPage,
        expectedOutputPdfFiles,
        expectedOutputUploadFiles,
        [],
      );
    },
  );

  electronBeforeAfterAllTest(
    'should upload Payslips.pdf to ftp, sftp, fileshare, ftps and http and should also send emails (My Report)',
    async ({ beforeAfterEach: firstPage }) => {
      const expectedOutputPdfFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '.pdf';
        },
      );

      const expectedOutputUploadFiles: string[] = [];

      Constants.PAYSLIPS_PDF_BURST_TOKENS.forEach(function (token) {
        ['ftp', 'sftp', 'fileshare', 'ftps', 'http', 'cloud'].forEach(
          function (uploadType) {
            expectedOutputUploadFiles.push(
              token + '_' + uploadType + '_upload.txt',
            );
          },
        );
      });

      const expectedOutputEmailFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '_email.txt';
        },
      );

      await _splitSendVerifyEmailsAndUploads(
        firstPage,
        expectedOutputPdfFiles,
        expectedOutputUploadFiles,
        expectedOutputEmailFiles,
      );
    },
  );
});

const _splitSendVerifyEmailsAndUploads = (
  firstPage: Page,
  expectedOutputPdfFiles: string[],
  expectedOutputUploadFiles: string[],
  expectedOutputEmailFiles: string[],
): FluentTester => {
  const ft = new FluentTester(firstPage);

  ft.click('#topMenuConfiguration')
    .click('#topMenuConfigurationLoad_burst_' + PATHS.SETTINGS_CONFIG_FILE)
    // send checkbox settings
    .click('#btnEnableDisableDistribution')
    .click('#btnSendDocumentsUpload');

  if (expectedOutputEmailFiles.length > 0) ft.click('#btnSendDocumentsEmail');

  // FTP settings
  ft.click('#leftMenuUploadSettings')
    // FTP settings
    .click('#tab-btn-ftpTab')
    .click('#ftpCommand')
    .typeText(
      '-T ${extracted_file_path} --ftp-create-dirs -u user:password ftp://ftp.example.com/reports/',
    )
    // File Share settings
    .click('#tab-btn-fileShareTab')
    .click('#fileShareCommand')
    .typeText('-T ${extracted_file_path} file://hostname/path/to/the%20folder')
    // FTPS settings
    .click('#tab-btn-ftpsTab')
    .click('#ftpsCommand')
    .typeText(
      '-T ${extracted_file_path} --ssl -u user:password ftp://ftp.example.com/reports/',
    )
    // SFTP settings
    .click('#tab-btn-sftpTab')
    .click('#sftpCommand')
    .typeText(
      '-T ${extracted_file_path} --ftp-create-dirs -u user:password sftp://ftp.example.com/reports/',
    )
    // HTTPS settings
    .click('#tab-btn-httpTab')
    .click('#httpCommand')
    .typeText(
      '-T ${extracted_file_path} --ntlm -u user:password https://sharepointserver.com/reports/',
    )
    // Cloud Upload settings
    .click('#tab-btn-cloudUploadTab')
    .click('#cloudUploadCommand')
    .typeText(
      '-T ${extracted_file_path} --ntlm -u user:password https://s3.amazonaws.com/documentburster',
    )
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
    .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
    .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
    .appStatusShouldBeGreatNoErrorsNoWarnings();

  if (expectedOutputPdfFiles.length > 0)
    ft.processingShouldHaveGeneratedOutputFiles(expectedOutputPdfFiles, 'pdf');

  if (expectedOutputUploadFiles.length > 0)
    ft.processingShouldHaveGeneratedOutputFiles(
      expectedOutputUploadFiles,
      '_upload.txt',
    );

  if (expectedOutputEmailFiles.length > 0)
    ft.processingShouldHaveGeneratedOutputFiles(
      expectedOutputEmailFiles,
      '_email.txt',
    );

  return ft;
};
