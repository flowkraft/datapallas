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
    'should split and send Payslips.pdf output files by email (My Report)',
    async ({ beforeAfterEach: firstPage }) => {
      await _splitSendVerifyEmails(
        firstPage,
        Constants.QA_TA,
        3,
        Constants.ATTACHMENTS_DEFAULT,
      );
    },
  );

  electronBeforeAfterAllTest(
    'should split and then correctly send Payslips.pdf generated emails and each email should go without any attachment (My Report)',
    async ({ beforeAfterEach: firstPage }) => {
      await _splitSendVerifyEmails(
        firstPage,
        Constants.QA_TR,
        2,
        Constants.ATTACHMENTS_CLEAR,
      );
    },
  );

  electronBeforeAfterAllTest(
    'should split and send Payslips.pdf emails with 2 attachments zipped together (My Report)',
    async ({ beforeAfterEach: firstPage }) => {
      await _splitSendVerifyEmails(
        firstPage,
        Constants.QA_TR,
        2,
        Constants.ATTACHMENTS_ADD_AND_ZIP,
      );
    },
  );

  electronBeforeAfterAllTest(
    'should send Payslips.pdf emails and emails should go with Customers-Distinct-Column-Values.xls attachment',
    async ({ beforeAfterEach: firstPage }) => {
      await _splitSendVerifyEmails(
        firstPage,
        Constants.QA_TA,
        3,
        Constants.ATTACHMENTS_XLS_ONLY,
      );
    },
  );

  electronBeforeAfterAllTest(
    'should send Payslips.pdf emails with 2 attachments the burst file and Customers-Distinct-Column-Values.xls',
    async ({ beforeAfterEach: firstPage }) => {
      await _splitSendVerifyEmails(
        firstPage,
        Constants.QA_TA,
        3,
        Constants.ATTACHMENTS_PDF_AND_XLS,
      );
    },
  );
});

const _splitSendVerifyEmails = (
  firstPage: Page,
  qaMode: string,
  numberOfRandomRecipients: number,
  attachmentsCommand: string,
): FluentTester => {
  const ft = new FluentTester(firstPage);
  ft.click('#topMenuConfiguration')
    .click('#topMenuConfigurationLoad_burst_' + PATHS.SETTINGS_CONFIG_FILE)
    // send email checkbox settings
    .click('#btnEnableDisableDistribution')
    .click('#btnSendDocumentsEmail')
    // email SMTP settings
    .click('#leftMenuEmailSettings') // email message settings
    .click('#tab-btn-emailMessageTab')
    .click('#emailSubject')
    .typeText('Subject $burst_token$')
    // email message settings
    .click('.ql-editor')
    .typeText('Message $burst_token$');

  if (attachmentsCommand === Constants.ATTACHMENTS_CLEAR) {
    ft.click('#tab-btn-attachmentsTab')
      .click('#btnClearAttachments')
      .clickYesDoThis();
  } else if (attachmentsCommand === Constants.ATTACHMENTS_ADD_AND_ZIP) {
    ft.click('#tab-btn-attachmentsTab')
      .click('#btnNewAttachment')
      .click('#attachmentPath')
      .typeText(
        path.resolve(
          slash(
            process.env.PORTABLE_EXECUTABLE_DIR +
              '/samples/burst/Customers-Distinct-Column-Values.xls',
          ),
        ),
      )
      .click(
        '#modalSelectAttachment .dburst-button-question-confirm-attachment',
      )
      .click('#btnArchiveAttachmentsTogether');
  } else if (attachmentsCommand === Constants.ATTACHMENTS_XLS_ONLY) {
    ft.click('#tab-btn-attachmentsTab')
      .click('#btnClearAttachments')
      .clickYesDoThis()
      .click('#btnNewAttachment')
      .click('#attachmentPath')
      .typeText(
        path.resolve(
          slash(
            process.env.PORTABLE_EXECUTABLE_DIR +
              '/samples/burst/Customers-Distinct-Column-Values.xls',
          ),
        ),
      )
      .click(
        '#modalSelectAttachment .dburst-button-question-confirm-attachment',
      );
  }

  ft.click('#topMenuBurst')
    .click('#leftMenuQualityAssurance')
    .appShouldBeReadyToRunNewJobs()
    .appStatusShouldBeGreatNoErrorsNoWarnings()
    .click('#qaBurstFile')
    .setInputFiles(
      '#qaFileUploadInput',
      path.resolve(
        process.env.PORTABLE_EXECUTABLE_DIR + '/samples/burst/Payslips.pdf',
      ),
    );

  let numberOfExpectedRecipients = 3;

  if (qaMode === Constants.QA_TA) {
    ft.click('#testTokensAll');
  } else if (qaMode === Constants.QA_TR) {
    numberOfExpectedRecipients = numberOfRandomRecipients;

    ft.click('#testTokensRandom')
      .click('#numberOfRandomTokens')
      .typeText(numberOfRandomRecipients.toString())
      .click('#startTestEmailServer')
      .clickYesDoThis()
      .waitOnElementToBecomeVisible(
        '#stopTestEmailServer',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      )
      .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR);
  }

  ft.click('#btnRunTest')
    .clickYesDoThis()
    .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
    .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
    .appStatusShouldBeGreatNoErrorsNoWarnings()
    .processingShouldHaveGeneratedNFilesHavingSuffix(
      numberOfExpectedRecipients,
      '.pdf',
    )
    .processingShouldHaveGeneratedNFilesHavingSuffix(
      numberOfExpectedRecipients,
      '_email.txt',
    )
    .shouldHaveSentNCorrectEmails(
      qaMode,
      numberOfExpectedRecipients,
      attachmentsCommand,
    );

  return ft;
};
